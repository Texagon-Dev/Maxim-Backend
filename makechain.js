import { OpenAI } from 'langchain/llms/openai';
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PromptTemplate } from "langchain/prompts";

import { loadQAStuffChain } from "langchain/chains";

export const makeChain = () => {

    const questionPromptTemplateString = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
    If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.
    If there are steps to the answer, please include them in your answer. Also place \n
    between steps to make your answer more readable. The Answer must given in Question's Language. Format your answer to be in markdown.

    {context}

    Question: {question}
    Helpful answer in markdown:`;
    

    const questionPrompt = new PromptTemplate({
        inputVariables: ["context", "question"],
        template: questionPromptTemplateString,
    });

    const refinePromptTemplateString = `
    The original question is as follows: {question}
    We have provided an existing answer: {existing_answer}
    We have the opportunity to refine the existing answer
    (only if needed) with some more context below.
    ------------
    {context}
    ------------
    Given the new context, refine the original answer to better answer the question.
    You must provide a response, either original answer or refined answer.The Answer must given in Question's Language.
    Format your answer to be in markdown`;

    const refinePrompt = new PromptTemplate({
        inputVariables: ["question", "existing_answer", "context"],
        template: refinePromptTemplateString,
    });

    const embeddings = new OpenAIEmbeddings();
    const model = new OpenAI({
        temperature: 0.5,
        modelName: 'gpt-3.5-turbo',
    });

    const chain = loadQAStuffChain(model, {
        questionPrompt,
        refinePrompt
    });


    return chain;
};