import express from "express";
import path from "path";
import cors from "cors";
import { Query, runforpdf, runforcsv, runfortxt, runfordocx, CheckTable, Login, supabase, WashTable } from "./supabase.js";
import fs from "fs";
import { unlink } from "fs/promises";
import chokidar from 'chokidar';
import multer from "multer";
import fetch, { Headers, Request } from 'node-fetch';
global.fetch = fetch;
global.Headers = Headers;
global.Request = Request;


const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;
const dir = './uploads';

let currentFile = "";

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/')
    },
    filename: (req, file, cb) => {
        currentFile = file.fieldname + '-' + Date.now() + path.extname(file.originalname)
        cb(null, currentFile)
    }
});

let timeoutId;
let uploadComplete = false;
const upload = multer({ storage: storage });
let uploadFile = null;

const watcher = chokidar.watch('uploads', {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
});

let clients = [];

function sendUpdates(message) {
    clients.forEach(client =>
        client.res.write(`data: ${JSON.stringify(message)}\n\n`)
    );

    // Remove clients whose connection was closed
    clients = clients.filter(client =>
        client.res.finished === false
    );
}

app.get('/', (req, res) => {
    res.send('Welcome to Maximm!');
});


//Only Checks on Sign In ONLY
app.post("/Validations", async (req, res) => {
    try {
        const { access_token } = req.body;
        const user = await CheckTable(access_token);
        if (!user) {
            res.status(404).send("Error : User Not Found");
        }
        res.status(200).send("Done");
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : User Not Found");
    }
});

//Starts the Chat
app.post('/CreateChat', upload.single('file'), async (req, res) => {

    const { access_token } = req.body;

    console.log(req.file);

    let FileUploadSuccess = false;
    const usr = await CheckTable(access_token);

    if (usr == false) {
        return res.status(404).send("Error : User Not Found");
    }

    await WashTable();
    await CheckTable(access_token);

    if (req.file && req.file.mimetype == "application/pdf") {
        try {
            uploadFile = await runforpdf(req.file.filename);
            if (uploadFile !== null) {
                await unlink(`uploads/${req.file.filename}`);
                console.log(`Processing of file ${req.file.filename} complete`);

                FileUploadSuccess = true;
            }
        } catch (err) {
            console.log(err);
            res.status(200).send("Error while processing the file.");
        }

    } else if (req.file && req.file.mimetype == "text/csv") {
        try {
            uploadFile = await runforcsv(req.file.filename);
            if (uploadFile !== null) {
                await unlink(`uploads/${req.file.filename}`);
                console.log(`Processing of file ${req.file.filename} complete`);
                FileUploadSuccess = true;
            }
        } catch (err) {
            console.log(err);
            res.status(200).send("Error while processing the file.");
        }

    } else if (req.file && req.file.mimetype == "text/plain") {
        try {
            uploadFile = await runfortxt(req.file.filename);
            if (uploadFile !== null) {
                await unlink(`uploads/${req.file.filename}`);
                console.log(`Processing of file ${req.file.filename} complete`);
                FileUploadSuccess = true;

            }
        } catch (err) {
            console.log(err);
            res.status(200).send("Error while processing the file.");
        }
    } else if (req.file && req.file.originalname.endsWith(".docx")) {
        try {
            uploadFile = await runfordocx(req.file.filename);
            if (uploadFile !== null) {
                await unlink(`uploads/${req.file.filename}`);
                console.log(`Processing of file ${req.file.filename} complete`);
                FileUploadSuccess = true;
            }
        } catch (err) {
            console.log(err);
            res.status(200).send("Error while processing the file.");
        }
    } else {
        res.status(200).send("No or UnSupported File Attached.Current Supported Extensions are pdf,csv,txt,docx file.");
    }


    if (FileUploadSuccess) {
        const { data, error } = await supabase
            .from('ChatLogs')
            .insert([{ UUID: usr.id, ChatName: 'New Chat', Status: "Incomplete", BookName: req.file.filename, originalName: req.file.originalname }]).select();

        if (error) {
            console.log('Error inserting chat log:', error.message); return res.status(200).send({
                error: error.message,
                Data: null,
                Summary: "Error while inserting chat log",
            });
        }
        else console.log('Chat log inserted successfully:', data)

        res.status(200).send(
            JSON.stringify(data)
        );

    } else {
        res.status(404).send("Error while processing the file.");
    }
});

app.post('/GetAllChats', async (req, res) => {
    try {
        const { access_token } = req.body;
        if (access_token == null || access_token == undefined || access_token == "") {
            res.status(404).send("Error : User Not Found");
            return;
        }
        const usr = await Login(access_token);

        //console.log("User Found : " + JSON.stringify(usr));

        if (usr.status == 200) {
            //console.log("User Found : " + JSON.stringify(usr.user));
            console.log("User Found : " + usr.id);

            const { data, error } = await supabase
                .from('ChatLogs')
                .select().eq('UUID', usr.id);

            if (error) {
                res.status(400).send("Error : Some ChatLog Related Error Occured");
                console.log('Error getting chat logs:', error.message);
                return;
            }
            console.log(data);
            res.status(200).send(data);
        } else {
            res.status(404).send("Error : User Not Found");
        }
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : Some User Related Error Occured");

    }
});

app.post('/DelChat', async (req, res) => {
    try {
        const { access_token, ChatID } = req.body;
        const usr = await Login(access_token);

        if (usr.status == 200) {
            const { error } = await supabase
                .from('ChatLogs')
                .delete()
                .eq('id', ChatID)
                .eq('UUID', usr.id);

            if (error) {
                console.log('Error deleting chat log:', error.message);
                res.status(400).send("Error : Some ChatLog Deleting Related Error Occured");
            } else {
                console.log('Chat log deleted successfully');
                res.status(200).send("Chat Deleted Successfully");
            }
        }
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : Some User Related Error Occured");
    };
});

app.post('/EditChat', async (req, res) => {
    try {
        const { access_token, ChatID, ChatName } = req.body;
        const usr = await Login(access_token);
        console.log(ChatID);
        console.log(ChatName);

        if (usr.status == 200) {
            const { data, error } = await supabase
                .from('ChatLogs').update({ ChatName: ChatName })
                .eq('id', ChatID)
                .eq('UUID', usr.id).select();

            console.log(data);

            if (error) {
                console.log('Error deleting chat log:', error.message);
                res.status(400).send("Error : Some ChatLog Name Editing Related Error Occured");
            } else {
                console.log('Chat log Edited successfully' + data);
                res.status(200).send("Chat Edited Successfully");
            }
        }
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : Some User Related Error Occured");
    };
});

app.post('/UpdateChat', async (req, res) => {
    try {
        const { UUID, ChatID, messages } = req.body;
        console.log(ChatID);
        console.log(messages);

        const { data, error } = await supabase
            .from('ChatLogs').update({ ChatHistory: messages })
            .eq('id', ChatID)
            .eq('UUID', UUID).select();

        console.log(data);

        if (error) {
            console.log('Error Updating History:', error.message);
            res.status(400).send("Error : Some Updating History Related Error Occured");
        } else {
            console.log('History Updated successfully' + data);
            res.status(200).send("History Updated Successfully");
        }
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : Some User Related Error Occured");
    };
});

app.post("/chat", async (req, res) => {
    try {
        const { access_token, query } = req.body;
        const usr = await Login(access_token);

        if (usr.status == 200) {
            const result = Query(query, null);
            console.log(result);
            result.then((output) => {
                res.status(200).json({ output: output });
            }
            );
        } else {
            res.status(404).send("Error : User Not Found");
        }
    }
    catch (err) {
        console.log(err);
    }
});

app.get('/training-status', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Add this client to the clients list
    clients.push({ req, res });

    // When the request is closed, remove it from the clients list
    req.on('close', () => {
        clients = clients.filter(client => client.req !== req);
    });
});

// app.listen(80, '178.17.1.201');
app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});