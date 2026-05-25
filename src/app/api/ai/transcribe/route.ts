import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  getSupportedLanguageByCode,
  type SupportedLanguage,
} from "@/lib/ai/languages";
import {
  MAX_TRANSCRIPTION_BYTES,
  transcribeAudioWithOpenAI,
} from "@/lib/ai/openai";

export const runtime = "nodejs";

function resolveTargetLanguage(code: string | null, name: string | null) {
  const supported = getSupportedLanguageByCode(code);

  if (supported) {
    return supported;
  }

  if (!code || !name) {
    return null;
  }

  return {
    code: code.toLowerCase(),
    shortCode: code.toUpperCase(),
    name,
    nativeName: name,
  } satisfies SupportedLanguage;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const formData = await request.formData();
  const audio = formData.get("audio");
  const targetLanguage = resolveTargetLanguage(
    formData.get("targetLanguageCode")?.toString() ?? null,
    formData.get("targetLanguageName")?.toString() ?? null,
  );

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Recorded audio is missing." }, { status: 400 });
  }

  if (!audio.size) {
    return NextResponse.json({ error: "Recorded audio is empty." }, { status: 400 });
  }

  if (audio.size > MAX_TRANSCRIPTION_BYTES) {
    return NextResponse.json(
      { error: "The recorded audio is too large. Please keep recordings short." },
      { status: 400 },
    );
  }

  if (!targetLanguage) {
    return NextResponse.json({ error: "Choose a valid output language." }, { status: 400 });
  }

  try {
    const result = await transcribeAudioWithOpenAI({
      audioFile: audio,
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
            : "Unable to transcribe the recording right now.",
      },
      { status: 500 },
    );
  }
}
