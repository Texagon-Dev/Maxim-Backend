import dotenv from "dotenv";
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { createClient } from "@supabase/supabase-js";
import { makeChain } from "./makechain.js";

import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { CSVLoader } from "langchain/document_loaders/fs/csv";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { JSONLoader } from "langchain/document_loaders/fs/json";
import { DocxLoader } from "langchain/document_loaders/fs/docx";
import { EPubLoader } from "langchain/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import { response } from "express";

dotenv.config();

const privateKey = process.env.SUPABASE_PRIVATE_KEY;
if (!privateKey) throw new Error(`Expected env var SUPABASE_PRIVATE_KEY`);

const url = process.env.SUPABASE_URL;
if (!url) throw new Error(`Expected env var SUPABASE_URL`);

export const supabase = createClient(url, privateKey, {
    auth: {
        persistSession: false,
    }
});

let currentLoggedInUser = null;
let DocumentName = null;
let RPCFuncName = null;


//Login and Necessary Table and Function Creation
export const Login = async (jwt) => {
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error) {
        console.error(error);
        return {
            user: null,
            id: null,
            status: 404
        };
    } else if (data?.user) {

        console.log("Login Successfull" + "\n" + data.user.id);

        currentLoggedInUser = data.user;
        DocumentName = currentLoggedInUser.id + "_documents";
        RPCFuncName = currentLoggedInUser.id + "_vf";

        return {
            user: data.user.user_metadata,
            id: data.user.id,
            status: 200
        };
    }
    else {
        return {
            user: null,
            id: null,
            status: 404
        };
    }
}

const CreateRPCDocument = async (table_name) => {
    const { data, error } = await supabase.rpc('create_document', {
        table_name: currentLoggedInUser.id + "_documents",
    });
    if (error) {
        console.error(error);
    }
    console.log("The RPCDocs 57 : " + data);
}

const CreateRPCfunction = async (table_name) => {
    const { data, error } = await supabase.rpc('create_matchdoc_rpc', {
        table_name: currentLoggedInUser.id + "_documents",
        vf_name: currentLoggedInUser.id + "_vf",
    });
    if (error) {
        console.error(error);
    }
    console.log("The RPC Func 67 : " + data);
}

export const CheckTable = async (jwt) => {
    const usr = await Login(jwt);
    if ((usr).status !== 200) {
        console.log("Login Failed");
        return false;
    }

    console.log("Login Successfull : " + usr.user);

    await supabase.rpc('tablecheck', { DocumentName }).then(async (response, error) => {
        if (error) {
            console.error(error);
            await CreateRPCDocument();
            console.log("Table Created");
        }

        console.log(response);

        if (response.length > 0) {
            console.log(`Table ${DocumentName} exists`);
        }
        else {
            console.log(`Table ${DocumentName} does not exist`);
            await CreateRPCDocument();
            console.log("Table Created2");
        }
    });

    await supabase.rpc('funccheck', { RPCFuncName }).then(async (response, error) => {
        if (error) {
            console.error(error);
            await CreateRPCfunction();
            console.log("RPC Created");
        }

        console.log(response);

        if (response.length > 0) {
            console.log(`RPC Func ${RPCFuncName} exists`);
        }
        else {
            console.log(`Table ${RPCFuncName} does not exist`);
            await CreateRPCfunction();
            console.log("RPC Created");
        }
    });

    return usr;
}

export const WashTable = async (jwt) => {
    try {
        const { error } = await supabase
            .from(DocumentName)
            .delete()
            .gt('id', 0);

        if (error) {
            console.log('Error deleting Trained Data :', error.message);
        } else {
            console.log('All chat logs deleted successfully');
            return true;
        }
    }
    catch (err) {
        console.log(err);
    }
    return false;
}

//End of Initial Login and Table and Function Creation



//Upload File Runner
export const runforpdf = async (filename) => {
    let loader = null;
    let docs = null;

    console.log(DocumentName + " ==> " + RPCFuncName);

    if (filename !== null) {
        try {

            loader = new PDFLoader(`./uploads/${filename}`);
            docs = await loader.load();

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1500,
                chunkOverlap: 200,
            });
            const docOutput = await splitter.splitDocuments(docs);

            console.log("Docs Output Correct");

            const vectorStore = await SupabaseVectorStore.fromDocuments(
                docOutput,
                new OpenAIEmbeddings(),
                {
                    client: supabase,
                    tableName: DocumentName,
                    queryName: RPCFuncName,
                }
            );

            console.log("After Docs Output Correct");
            return 1;
        } catch (err) {
            console.log(err);
        }
    }

    return null;
};

export const runforcsv = async (filename) => {
    let loader = null;
    let docs = null;

    if (filename !== null) {
        try {
            loader = new CSVLoader(`./uploads/${filename}`);
            docs = await loader.load();

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1500,
                chunkOverlap: 200,
            });
            const docOutput = await splitter.splitDocuments(docs);
            const vectorStore = await SupabaseVectorStore.fromDocuments(
                docOutput,
                new OpenAIEmbeddings(),
                {
                    client: supabase,
                    tableName: DocumentName,
                    queryName: RPCFuncName,
                }
            );
            return 1;
        } catch (err) {
            console.log(err);
        }
    }

    return null;
};

export const runfortxt = async (filename) => {
    let loader = null;
    let docs = null;

    if (filename !== null) {
        try {
            loader = new TextLoader(`./uploads/${filename}`);
            docs = await loader.load();

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1500,
                chunkOverlap: 200,
            });
            const docOutput = await splitter.splitDocuments(docs);
            const vectorStore = await SupabaseVectorStore.fromDocuments(
                docOutput,
                new OpenAIEmbeddings(),
                {
                    client: supabase,
                    tableName: DocumentName,
                    queryName: RPCFuncName,
                }
            );
            return 1;
        } catch (err) {
            console.log(err);
        }
    }

    return null;
};

export const runforjson = async (filename) => {

    //Error in Loading JSON File in JSONLOADER
    let loader = null;
    let docs = null;

    if (filename !== null) {
        try {

            console.log("JSON File Processing Starting");
            loader = new JSONLoader(`./uploads/${filename}`);
            docs = await loader.load();

            console.log("JSON File Processing Starting after Docs");
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1500,
                chunkOverlap: 200,
            });
            const docOutput = await splitter.splitDocuments(docs);
            const vectorStore = await SupabaseVectorStore.fromDocuments(
                docOutput,
                new OpenAIEmbeddings(),
                {
                    client: supabase,
                    tableName: DocumentName,
                    queryName: RPCFuncName,
                }
            );
            console.log("JSON File Processed");
            return 1;
        } catch (err) {
            console.log(err);
        }
    }
    console.log("Error in runforjson");
    return null;
};

export const runfordocx = async (filename) => {
    let loader = null;
    let docs = null;

    if (filename !== null) {
        try {
            loader = new DocxLoader(`./uploads/${filename}`);
            docs = await loader.load();

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1500,
                chunkOverlap: 200,
            });
            const docOutput = await splitter.splitDocuments(docs);
            const vectorStore = await SupabaseVectorStore.fromDocuments(
                docOutput,
                new OpenAIEmbeddings(),
                {
                    client: supabase,
                    tableName: DocumentName,
                    queryName: RPCFuncName,
                }
            );
            return 1;
        } catch (err) {
            console.log(err);
        }
    }

    return null;
};

export const runforepub = async (filename) => {
    let loader = null;
    let docs = null;

    if (filename !== null) {
        try {
            loader = new EPubLoader(`./uploads/${filename}`);
            docs = await loader.load();

            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1500,
                chunkOverlap: 200,
            });
            const docOutput = await splitter.splitDocuments(docs);
            const vectorStore = await SupabaseVectorStore.fromDocuments(
                docOutput,
                new OpenAIEmbeddings(),
                {
                    client: supabase,
                    tableName: DocumentName,
                    queryName: RPCFuncName,
                }
            );
            return 1;
        } catch (err) {
            console.log(err);
        }
    }

    return null;
};

//End of Upload File Runner













//Query Runner
export const Query = async (query) => {
    let loader = null;
    let docs = null;

    console.log("Query from Supabase : ", query);
    console.log("Document : " + DocumentName);
    console.log("RPC : " + RPCFuncName);

    const vectorStore = await SupabaseVectorStore.fromExistingIndex(
        new OpenAIEmbeddings(),
        {
            client: supabase,
            tableName: DocumentName,
            queryName: RPCFuncName,
        }
    );

    const chain = makeChain(vectorStore)
    const result = await chain.call({
        question: query,
        context: docs,
        chat_history: [],
    });
    return result;
}
