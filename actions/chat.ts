"use server";

import { getUser } from "@/lib/auth";
import { generateRandomId } from "@/lib/utils";
import prisma from "@/prisma/client";
import { JsonMessagesArraySchema } from "@/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import OpenAI from "openai";

export type Message = {
  message: string;
  conversationId: string;
};

export type NewMessage = Omit<Message, "conversationId">;

export async function newChat(params: NewMessage) {
  const session = await getUser();
  if (!session?.user) redirect("/login");
  let id: string | undefined;
  let error: undefined | { message: string };
  try {
    const responseMessage = await createCompletion(
      params.message
    );
    const newConversationId = generateRandomId(8);
    const newMessageJson = [
      {
        id: newConversationId,
        question: params.message,
        answer: responseMessage.message.content,
      },
    ];
    const dataRef = await prisma.conversation.create({
      data: {
        messages: newMessageJson,
        name: params.message,
        userId: session.user.id,
      },
    });
    id = dataRef.id;
  } catch (err) {
    if (err instanceof Error) error = { message: err.message };
  }
  console.log(error);

  if (error) return error;
  redirect(`/chat/${id}`);
}

export async function chat(params: Message) {
  let error: undefined | { message: string };
  try {
    const responseMessage = await createCompletion(
      params.message
    );
    const newConversationId = generateRandomId(8);
    const dataRef = await prisma.conversation.findUnique({
      where: {
        id: params.conversationId,
      },
    });
    const updatedMessageJson = [
      ...JsonMessagesArraySchema.parse(dataRef?.messages),
      {
        id: newConversationId,
        question: params.message,
        answer: responseMessage.message.content,
      },
    ];
    await prisma.conversation.update({
      where: {
        id: params.conversationId,
      },
      data: {
        messages: updatedMessageJson,
      },
    });
  } catch (err) {
    if (err instanceof Error) error = { message: err.message };
  }
  console.log(error);

  if (error) return error;
  revalidatePath(`/chat/${params.conversationId}`);
}

declare global {
  var ai_map: undefined | Map<string, OpenAI>;
}

function createOpenAIInstance(): OpenAI {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API key is missing.');
  }
  
  return new OpenAI({ apiKey });
}

let ai: OpenAI = createOpenAIInstance();

async function createCompletion(message: string) {
  const chatCompletion = await ai.chat.completions.create({
    messages: [{ role: "user", content: message }],
    model: "gpt-3.5-turbo",
  });
  return chatCompletion.choices[0];
}
