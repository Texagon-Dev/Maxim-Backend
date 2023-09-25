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

import Stripe from 'stripe';
const stripe = new Stripe('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');

const endpointSecret = "whsec_qvk9uvugt90HM5k8buf2tWalfDsCfGrPn";

app.post('/stripe_webhooks', express.raw({ type: 'application/json' }), async (request, response) => {
    const sig = request.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
        response.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the event
    switch (event.type) {
        case 'customer.subscription.deleted':
            const customerSubscriptionDeleted = event.data.object;
            console.log("The Customer Subscription is Deleted.");
            console.log(customerSubscriptionDeleted.customer);
            await supabase.from('Customers').update({ bookuploads: 5 }, {
                plan: 1
            },
                {
                    allowedquestions: 20
                }).eq('StripeCustID', customerSubscriptionDeleted.customer);
            break;
        case 'customer.subscription.updated':
            const customerSubscriptionUpdated = event.data.object;

            if (customerSubscriptionUpdated.cancel_at_period_end) {
                console.log("Hello World Data : ", customerSubscriptionUpdated)
                // Alert the Structure to be Cancelled at the Period End

                return;
            }

            if (customerSubscriptionUpdated.status == 'active') {
                const plan = customerSubscriptionUpdated.plan;
                console.log(plan.active ? plan.product : "No Plan Active Currently")

                const plandata = await supabase.from('Plans').select('*').eq('PlanStripeID', plan.product);

                await supabase.from('Customers').update({
                    bookuploads: plandata.data[0].bc,
                    Plan: plandata.data[0].Pid,
                    allowedquestions: plandata.data[0].qps
                }).eq('StripeCustID', customerSubscriptionUpdated.customer);
            }

            console.log("The Customer Subscription is Updated.");
            console.log(customerSubscriptionUpdated);
            break;
        case 'customer.subscription.created':
            const CustomerSubscriptionCreated = event.data.object;

            if (CustomerSubscriptionCreated.cancel_at_period_end) {
                console.log("Hello World Data : ", CustomerSubscriptionCreated)
                // Alert the Structure to be Cancelled at the Period End

                return;
            }

            if (CustomerSubscriptionCreated.status == 'active') {
                const plan = CustomerSubscriptionCreated.plan;
                console.log(plan.active ? plan.product : "No Plan Active Currently")

                const plandata = await supabase.from('Plans').select('*').eq('PlanStripeID', plan.product);

                await supabase.from('Customers').update({
                    bookuploads: plandata.data[0].bc,
                    Plan: plandata.data[0].Pid,
                    allowedquestions: plandata.data[0].qps
                }).eq('StripeCustID', CustomerSubscriptionCreated.customer);
            }

            console.log("The Customer Subscription is Updated.");
            console.log(CustomerSubscriptionCreated);
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }
    response.status(200).send();
});


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

const upload = multer({ storage: storage });
let uploadFile = null;

const watcher = chokidar.watch('uploads', {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
});

let clients = [];

app.get('/', (req, res) => {
    res.send('Welcome to Maximm! Version == 1.0.1');
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

        if (!userData[0].StripeCustID) {

            console.log("Creating Customer..... with ", usr.user.email);
            const stripecustomer = await stripe.customers.create({
                email: usr.user.email,
                name: usr.user.name,
            });

            console.log('Customer created : ', stripecustomer);

            customer = (await supabase.from("Customers").update([{ UUID: usr.id, StripeCustID: stripecustomer.id }]).eq("UUID", usr.id).select()).data[0];

            console.log(customer);
        }


        // const subscription = await stripe.subscriptions.create({
        //     customer: customer.StripeCustID,
        //     items: [{ plan: product.PlanStripeID }],
        // });

        return customer.StripeCustID;
    } catch (err) {
        console.error("Error:", err);
        return "Error: An unexpected error occurred";
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

        if (!userData[0].StripeCustID) {

            console.log("Creating Customer..... with ", usr.user.email);
            const stripecustomer = await stripe.customers.create({
                email: usr.user.email,
                name: usr.user.name,
            });

            const subscription = await stripe.subscriptions.create({
                customer: stripecustomer.id,
                items: [
                    { price: 'price_1NtzLhEG5HXSwBYiXVtFzxhu' },
                ],
            });

            console.log('Customer created : ', stripecustomer);

            customer = (await supabase.from("Customers").update([{ UUID: usr.id, StripeCustID: stripecustomer.id }]).eq("UUID", usr.id).select()).data[0];

            console.log(customer);
        }

        try {

            console.log(customer.StripeCustID)

            session = await stripe.checkout.sessions.create({
                success_url: 'https://yadocs.com/PaySuccess',
                cancel_url: 'https://yadocs.com/PayFailed',
                customer: customer.StripeCustID,
                line_items: [{
                    price: product.Price_ID,
                    quantity: 1,
                }],
                mode: 'subscription',
            });


            console.log(session);
        }
        catch (err) {
            return res.status(500).json({ "error_message": "Error in creating checkout session", "error": err })
        }

        //console.log(session);

        return res.status(200).send(session.url);

    } catch (err) {
        console.error("Error:", err);
        res.status(404).send({ "err": "Error: An unexpected error occurred " });
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
                    //stripecustomer = await update(access_token);
                    return res.status(200).send({
                        status: 5, msg: "Failed", link: "https://yadocs.com/pricing"
                    })
                }
                else {
                    const customer = await stripe.billingPortal.sessions.create({
                        customer: data.StripeCustID ? data.StripeCustID : stripecustomer,
                        return_url: ret_url ? ret_url : "https://yadocs.com",
                    });

                    return res.status(200).send({ status: 2, msg: "success", link: customer });
                }
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