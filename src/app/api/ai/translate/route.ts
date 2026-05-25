import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  getSupportedLanguageByCode,
  type SupportedLanguage,
} from "@/lib/ai/languages";
import {
  MAX_TRANSLATION_CHARACTERS,
  translateTextWithOpenAI,
} from "@/lib/ai/openai";

export const runtime = "nodejs";

type TranslatePayload = {
  text?: string;
  targetLanguageCode?: string;
  targetLanguageName?: string;
};

function resolveTargetLanguage(payload: TranslatePayload) {
  const supported = getSupportedLanguageByCode(payload.targetLanguageCode);

  if (supported) {
    return supported;
  }

  if (!payload.targetLanguageCode || !payload.targetLanguageName) {
    return null;
  }

  return {
    code: payload.targetLanguageCode.toLowerCase(),
    shortCode: payload.targetLanguageCode.toUpperCase(),
    name: payload.targetLanguageName,
    nativeName: payload.targetLanguageName,
  } satisfies SupportedLanguage;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: TranslatePayload = {};

  try {
    payload = (await request.json()) as TranslatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid translation request." }, { status: 400 });
  }

  const text = payload.text?.trim() ?? "";
  const targetLanguage = resolveTargetLanguage(payload);

  if (!text) {
    return NextResponse.json({ error: "Enter text to translate." }, { status: 400 });
  }

  if (text.length > MAX_TRANSLATION_CHARACTERS) {
    return NextResponse.json(
      {
        error: `Text is too long to translate at once. Keep it under ${MAX_TRANSLATION_CHARACTERS} characters.`,
      },
      { status: 400 },
    );
  }

  if (!targetLanguage) {
    return NextResponse.json({ error: "Choose a valid output language." }, { status: 400 });
  }

  try {
    const result = await translateTextWithOpenAI({
      text,
      targetLanguageCode: targetLanguage.code,
      targetLanguageName: targetLanguage.name,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to translate the message right now.",
      },
      { status: 500 },
    );
  }
}
