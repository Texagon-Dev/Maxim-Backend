import dotenv from "dotenv";
import { SupabaseVectorStore } from "langchain/vectorstores/supabase";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { createClient } from "@supabase/supabase-js";
import { makeChain } from "./makechain.js";
import fs from "fs";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { CSVLoader } from "langchain/document_loaders/fs/csv";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { DocxLoader } from "langchain/document_loaders/fs/docx";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

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

export const getplandetails = async (chatid) => {
    const { data, error } = await supabase.from('ChatLogs').select('*').eq('id', chatid);

    if (data) {
        return data;
    }
    return null;
}

export const updateallowedquestion = async (ChatID, UUID) => {
    await supabase.rpc("update_allowed_questions", {
        chatid: ChatID,
        uuid_param: UUID,
    });
}

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

        currentLoggedInUser = data.user;
        DocumentName = currentLoggedInUser.id;
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

export const CheckTable = async (jwt) => {

    const usr = await Login(jwt);
    if ((usr).status !== 200) {
        console.log("Login Failed");
        return false;
    }

    const { data, error } = await supabase.rpc('create_matchdoc_rpc', {
        vf_name: currentLoggedInUser.id + "_vf",
        table_name: currentLoggedInUser.id,
    });

    return usr;
}

export const uploadFiletoSupabase = async (file) => {
    console.log("================================================");
    try {
        const datafile = await fs.promises.readFile(`./uploads/${file.filename}`);
        const { data, error } = await supabase.storage.from('Documents').upload(file.filename, datafile);

        if (error) {
            console.log('Error in Uploading File:', error.message);
            return false;
        } else {
            console.log('File Uploaded Successfully');
            return true;
        }
    } catch (err) {
        console.error('Error:', err.message);
        return false;
    }
    return true;
}

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

export const DelDocfromSupabase = async (filename) => {

    console.log("Deleting : " + './uploads/' + filename);
    const escapedFilename = filename.replace(/'/g, "\\'");
    const { data, error } = await supabase
        .from(DocumentName)
        .delete()
        .eq('metadata->>source', `./uploads/${escapedFilename}`);

    console.log(data, error);
    console.log("Deleted : " + './uploads/' + filename);
}

//Query Runner
export const Query = async (query, Document) => {

    let loader = null;
    let docs = null;

    const vectorStore = await SupabaseVectorStore.fromExistingIndex(
        new OpenAIEmbeddings(),
        {
            client: supabase,
            tableName: DocumentName,
            queryName: RPCFuncName,
        }
    );

    const relevantDocs = await vectorStore.similaritySearch(query, undefined, {
        source: "./uploads/" + Document,
    });

    console.log("Relevant Docs : ", relevantDocs);

    if (relevantDocs.length === 0) {
        return {
            result: "No Relevant Information Found in the Uploaded Document.",
            sources: []
        };
    }

    const chain = makeChain();

    let sources = [];

    for (const document of relevantDocs) {
        sources.push(document.metadata);
    }

    const result = await chain.call({
        input_documents: relevantDocs,
        context: relevantDocs,
        question: query,
    });

    return {
        result: result.text,
        sources: sources
    };
}