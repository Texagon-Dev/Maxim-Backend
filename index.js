import express from "express";
import path from "path";
import cors from "cors";
import { Query, runforpdf, runforcsv, runfortxt, runfordocx, CheckTable, Login, supabase, updateallowedquestion, getplandetails, uploadFiletoSupabase, DelDocfromSupabase } from "./supabase.js";
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
    res.send('Welcome to Maximm! Version == 1.0.0');
});


//Starts the Chat
app.post('/CreateChat', upload.single('file'), async (req, res) => {

    const { access_token } = req.body;

    let FileUploadSuccess = false;

    const usr = await CheckTable(access_token);

    if (usr == false) {
        return res.status(401).send("Error : User Not Found");
    }


    const userdata = await supabase.from('Customers').select('*').eq('UUID', usr.id);
    if (userdata.data[0].bookuploads > 0) {
        await supabase.from('Customers').update({ bookuploads: userdata.data[0].bookuploads - 1 }).eq('UUID', usr.id);
    }
    else {
        return res.status(404).send("Error : No Uploads Left");
    }

    console.log("The Requested File is : ", req.file);

    if (req.file && req.file.mimetype == "application/pdf") {
        try {
            uploadFile = await runforpdf(req.file.filename);
            if (uploadFile !== null) {
                await uploadFiletoSupabase(req.file);
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
                await uploadFiletoSupabase(req.file);
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
                await uploadFiletoSupabase(req.file);
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
            await uploadFiletoSupabase(req.file);

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
            //console.log("User Found : " + usr.id);

            const { data, error } = await supabase
                .from('ChatLogs')
                .select().eq('UUID', usr.id);

            if (error) {
                res.status(400).send("Error : Some ChatLog Related Error Occured");
                console.log('Error getting chat logs:', error.message);
                return;
            }
            res.status(200).send(data);
        } else {
            return res.status(401).send("Error : User Not Found");
        }
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : Some User Related Error Occured");
    }
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
        //console.log(ChatID);
        //console.log(messages);

        const { data, error } = await supabase
            .from('ChatLogs').update({ ChatHistory: messages })
            .eq('id', ChatID)
            .eq('UUID', UUID).select();

        //console.log(data);

        if (error) {
            console.log('Error Updating History:', error.message);
            res.status(400).send("Error : Some Updating History Related Error Occured");
        } else {
            //console.log('History Updated successfully' + data);
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
        const { access_token, query, ChatID } = req.body;
        const [usr, plan] = await Promise.all([Login(access_token), getplandetails(ChatID)]);

        console.log("The Chat ID is " + ChatID);
        console.log(plan);

        if (usr.status == 200) {

            const [result, _] = await Promise.all([Query(query, plan[0].BookName), updateallowedquestion(ChatID, usr.id)]);

            res.status(200).json({ result });
        } else {
            res.status(404).send("Error: User Not Found");
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("Internal Server Error");
    }
});

app.post('/getChatDocument', async (req, res) => {
    try {
        const { access_token, ChatID } = req.body;
        const usr = await Login(access_token);
        const chat = await supabase.from('ChatLogs').select('*').eq('id', ChatID).eq('UUID', usr.id);
        if (usr.status == 200) {
            if (chat.data.length == 0) {
                res.status(404).send("Error : Chat Not Found");
            } else {
                console.log(chat.data[0].BookName);

                const { data, error } = await supabase
                    .storage
                    .from('Documents')
                    .createSignedUrl(chat.data[0].BookName, 60 * 60);

                if (error) {
                    console.error('Error creating temporary link:', error.message);
                    res.status(400).send("Error : Documment Error");
                    return null;
                }
                res.status(200).send({ BookName: chat.data[0].BookName, url: data.signedUrl });
            }
        }
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : Some User Related Error Occured");
    };
});

app.post('/DelChat', async (req, res) => {
    try {
        const { access_token, ChatID } = req.body;
        const usr = await Login(access_token);
        //return res.status(200).send("Chat Deleted Successfully");

        if (usr.status == 200) {

            const chat = await supabase.from('ChatLogs').select('*').eq('id', ChatID).eq('UUID', usr.id).single();
            console.log(chat.data.BookName);

            await DelDocfromSupabase(chat.data.BookName);

            const { error } = await supabase
                .from('ChatLogs')
                .delete()
                .eq('id', ChatID)
                .eq('UUID', usr.id);

            if (error) {
                console.log('Error deleting chat log:', error.message);
                return res.status(400).send("Error : Some ChatLog Deleting Related Error Occured");
            } else {

                const { data, error } = await supabase.storage.from('Documents').remove([chat.data.BookName]);

                return res.status(200).send("Chat Deleted Successfully");
            }
        }
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : Some User Related Error Occured");
    };
});

import Stripe from 'stripe';

const stripe = new Stripe('sk_test_51NnPYYEG5HXSwBYisvgUEPcemkoFccxzfiTzKHic6ph67LyIRrMelKHxfiaFik6Q8SHXIBMBnFdHoEUmQQYEeUHX000urjdAr3');


app.post('/stripe_webhooks', async (req, res) => {
    console.log("Webhook Called");
    const event = req.body;
    console.log(event);
    res.status(200).send("Webhook Called");

});

async function update(access_token, planid = 1) {

    try {

        const usr = await Login(access_token);

        if (!usr || !usr.id) {
            return res.status(404).send("Error: User authentication failed or user not found.");
        }

        const [planResponse, userResponse] = await Promise.all([
            supabase.from("Plans").select("*").eq("Pid", planid),
            supabase.from("Customers").select("*").eq("UUID", usr.id)
        ]);

        const planData = planResponse.data;
        let userData = userResponse.data;
        let product;
        let customer;

        console.log(usr);

        if (!planData || !planData.length) {
            return res.status(404).send("Error: Plan not found");
        }
        else {
            console.log(planData);
            if (!(planData[0].PlanStripeID) || (planData[0].PlanStripeID == null)) {

                console.log("Creating Product");

                product = await stripe.products.create({
                    name: planData[0].PlanName,
                    default_price_data: {
                        unit_amount: planData[0].Price * 100,
                        currency: 'eur',
                        recurring: {
                            interval: 'month',
                        },
                    },
                    description: planData[0].PlanDescription,
                });

                product = await supabase.from("Plans").update({ PlanStripeID: product.id, Price_ID: product.default_price }).eq("Pid", planid).select();
                product = product.data[0];
            }
            else {
                product = planData[0];
            }
            console.log(product);
        }

        if (!userData || !userData.length) {
            const stripecustomer = await stripe.customers.create({
                email: usr.email,
                name: usr.user.name,
            });

            console.log('Customer created : ', stripecustomer);
            customer = (await supabase.from("Customers").insert([{ UUID: usr.id, StripeCustID: stripecustomer.id }]).select()).data;
        }
        else {
            if (!(userData[0].StripeCustID)) {
                const stripecustomer = await stripe.customers.create({
                    email: usr.email,
                    name: usr.user.name,
                });
                customer = (await supabase.from("Customers").update([{ UUID: usr.id, StripeCustID: stripecustomer.id }]).eq("UUID", usr.id).select()).data;
            }
            else {
                customer = userData[0];
            }
        }

        const subscription = await stripe.subscriptions.create({
            customer: customer.StripeCustID,
            items: [{ plan: product.PlanStripeID }],
        });

        console.log(subscription);

        return customer.StripeCustID;
    } catch (err) {
        console.error("Error:", err);
        return res.status(500).send("Error: An unexpected error occurred");
    }

}

app.post('/getStripe', async (req, res) => {
    try {
        const { access_token, planid } = req.body;

        const usr = await Login(access_token);

        if (!usr || !usr.id) {
            return res.status(404).send("Error: User authentication failed or user not found.");
        }

        const [planResponse, userResponse] = await Promise.all([
            supabase.from("Plans").select("*").eq("Pid", planid),
            supabase.from("Customers").select("*").eq("UUID", usr.id)
        ]);

        const planData = planResponse.data;
        let userData = userResponse.data;
        let product = planData[0];
        let customer = userData[0];
        let session;

        if (!planData[0].PlanStripeID) {
            console.log("Creating Product.....");

            product = await stripe.products.create({
                name: planData[0].PlanName,
                default_price_data: {
                    unit_amount: planData[0].Price * 100,
                    currency: 'eur',
                    recurring: {
                        interval: 'month',
                    },
                },
                description: planData[0].PlanDescription,
            });

            product = await supabase.from("Plans").update({ PlanStripeID: product.id, Price_ID: product.default_price }).eq("Pid", planid).select();
            product = product.data[0];
        }

        if(!userData[0].StripeCustID){

            console.log("Creating Customer..... with ", usr.user.email);
            const stripecustomer = await stripe.customers.create({
                email: usr.user.email,
                name: usr.user.name,
            });

            console.log('Customer created : ', stripecustomer);

            customer = (await supabase.from("Customers").update([{ UUID: usr.id, StripeCustID: stripecustomer.id }]).eq("UUID", usr.id).select()).data[0];

            console.log(customer);
        }

        try {
            session = await stripe.checkout.sessions.create({
                success_url: 'https://www.yadocs.com/PaySuccess',
                cancel_url: 'https://www.yadocs.com/PayFailed',
                customer: customer.StripeCustID,
                line_items: [{
                    price: product.Price_ID,
                    quantity: 1,
                }],
                mode: 'subscription',
            });
        }
        catch (err) {
            res.status(500).json({ "error_message": "Error in creating checkout session", "error": err })
            return;
        }

        //console.log(session);

        return res.status(200).send(session.url);

    } catch (err) {
        console.error("Error:", err);
        return res.status(500).send("Error: An unexpected error occurred");
    }
});

app.post('/getpaymentlist', async (req, res) => {
    try {
        const { access_token, ret_url } = req.body;
        const usr = await Login(access_token);

        if (usr.status == 200) {
            const { data, error } = await supabase
                .from('Customers')
                .select('*')
                .eq('UUID', usr.id).single();

            if (error) {
                console.log('Error getting customer:', error.message);
                return res.status(400).send("Error : Some Customer Related Error Occured");
            } else {
                console.log('Customer retrieved successfully' + data);
                let stripecustomer;
                if (data.StripeCustID == null) {
                    stripecustomer = await update(access_token);
                }

                const customer = await stripe.billingPortal.sessions.create({
                    customer: data.StripeCustID ? data.StripeCustID : stripecustomer,
                    return_url: ret_url ? ret_url : "https://www.yadocs.com",
                });

                return res.status(200).send({ status: 2, msg: "success", link: customer });
            }
        }
        res.send(401).send("Error : User Not Found");
    }
    catch (err) {
        console.log(err);
        res.status(404).send("Error : Some User Related Error Occured");
    };
});


app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});


/*

    {
  "session": {
    "id": "cs_test_a12yfb9AVYkpC1x1NyoM73vkOgBkEXLrxIUpagxLY7ibwFueMPNRC0DtdY",
    "object": "checkout.session",
    "after_expiration": null,
    "allow_promotion_codes": null,
    "amount_subtotal": 500,
    "amount_total": 500,
    "automatic_tax": {
      "enabled": false,
      "status": null
    },
    "billing_address_collection": null,
    "cancel_url": "https://www.facebook.com",
    "client_reference_id": null,
    "consent": null,
    "consent_collection": null,
    "created": 1691582895,
    "currency": "eur",
    "currency_conversion": null,
    "custom_fields": [],
    "custom_text": {
      "shipping_address": null,
      "submit": null
    },
    "customer": "cus_OQ0hnPGERaYw4A",
    "customer_creation": null,
    "customer_details": {
      "address": null,
      "email": "skjdasjdljassoldjolasjso@khdsj.com",
      "name": null,
      "phone": null,
      "tax_exempt": "none",
      "tax_ids": null
    },
    "customer_email": null,
    "expires_at": 1691669295,
    "invoice": null,
    "invoice_creation": null,
    "livemode": false,
    "locale": null,
    "metadata": {},
    "mode": "subscription",
    "payment_intent": null,
    "payment_link": null,
    "payment_method_collection": "always",
    "payment_method_options": null,
    "payment_method_types": [
      "card"
    ],
    "payment_status": "unpaid",
    "phone_number_collection": {
      "enabled": false
    },
    "recovered_from": null,
    "setup_intent": null,
    "shipping_address_collection": null,
    "shipping_cost": null,
    "shipping_details": null,
    "shipping_options": [],
    "status": "open",
    "submit_type": null,
    "subscription": null,
    "success_url": "https://www.google.com",
    "total_details": {
      "amount_discount": 0,
      "amount_shipping": 0,
      "amount_tax": 0
    },
    "url": "https://checkout.stripe.com/c/pay/cs_test_a12yfb9AVYkpC1x1NyoM73vkOgBkEXLrxIUpagxLY7ibwFueMPNRC0DtdY#fid2cGd2ZndsdXFsamtQa2x0cGBrYHZ2QGtkZ2lgYSc%2FY2RpdmApJ2R1bE5gfCc%2FJ3VuWnFgdnFaMDRLZEo0RkxpMFc2fDFKTnJNNXNrYE9QX0RtQzFmR1BCTUpufEJWXH9%2FS2BKNFNsZEpgSXdTN1R8bTBhazRRYGI3PW9BRmBcf2Zya05GQmxzZ0xOPXNLMkQ1NTJzdEBPS2owJyknY3dqaFZgd3Ngdyc%2FcXdwYCknaWR8anBxUXx1YCc%2FJ3Zsa2JpYFpscWBoJyknYGtkZ2lgVWlkZmBtamlhYHd2Jz9xd3BgeCUl"
  }
}

*/