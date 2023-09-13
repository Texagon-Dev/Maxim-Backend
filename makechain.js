import { OpenAI } from 'langchain/llms/openai';
import { loadQARefineChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { PromptTemplate } from "langchain/prompts";
import { loadQAMapReduceChain } from "langchain/chains";

import { loadQAStuffChain } from "langchain/chains";

export const makeChain = () => {

    const questionPromptTemplateString1 = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
    If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
    If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.
    If there are steps to the answer, please include them in your answer. Also place \n
    between steps to make your answer more readable. The Answer must given in Question's Language. Format your answer to be in markdown.

    {context}

    Question: {question}
    Helpful answer in markdown:`;


    const questionPromptTemplateString = `Vous êtes un assistant IA utile. Utilisez les éléments de contexte suivants pour répondre à la question à la fin.
    Si vous ne connaissez pas la réponse, dites simplement que vous ne la savez pas. N'essayez PAS d'inventer une réponse.
    Si la question n'est pas liée au contexte, répondez poliment que vous êtes prêt à répondre uniquement aux questions liées au contexte.
    Si la réponse comporte des étapes, veuillez les inclure dans votre réponse. Placez également \n
    entre les étapes pour rendre votre réponse plus lisible. La réponse doit être donnée dans la langue de la question. Formatez votre réponse pour qu'elle soit en démarque.

    {context}

    Question: {question}
    Réponse utile en démarque:`;


    const questionPrompt = new PromptTemplate({
        inputVariables: ["context", "question"],
        template: questionPromptTemplateString,
    });

    const refinePromptTemplateString = `
    La question initiale est la suivante : {question}
    Nous avons fourni une réponse existante : {existing_answer}
    Nous avons la possibilité d'affiner la réponse existante
    (uniquement si nécessaire) avec un peu plus de contexte ci-dessous.
    ------------
    {context}
    ------------
    Compte tenu du nouveau contexte, affinez la réponse originale pour mieux répondre à la question.
    Vous devez fournir une réponse, soit une réponse originale, soit une réponse affinée. La réponse doit être donnée dans la langue de la question.`;

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