import { OpenAI } from 'langchain/llms/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';

const CONDENSE_PROMPT = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

    Chat History:
    {chat_history}
    Follow Up Input: {question}
    Standalone question:`;

const QA_PROMPT = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
    If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.
    If there are steps to the answer, please include them in your answer. Also place \n
    between steps to make your answer more readable. Format your answer to be in markdown.

    {context}

    Question: {question}
    Helpful answer in markdown:`;

export const makeChain = (vectorstore,source) => {
    const model = new OpenAI({
        temperature: 0.4,
        modelName: 'gpt-3.5-turbo',
    });

    const chain = ConversationalRetrievalQAChain.fromLLM(
        model,
        vectorstore.asRetriever(),
        {
            qaTemplate: QA_PROMPT,
            questionGeneratorTemplate: CONDENSE_PROMPT,
            returnSourceDocuments: true, //The number of source documents returned is 4 by default
            qaChainOptions: {
                type: "stuff",
                filter: (doc) => doc.metadata.source === source,
            },
        },
    );
    return chain;
};