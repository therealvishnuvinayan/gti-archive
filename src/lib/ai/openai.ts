import { getSupportedLanguageByCode } from "@/lib/ai/languages";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const TRANSLATION_MODEL = process.env.OPENAI_TRANSLATION_MODEL ?? "gpt-4.1-mini";
const STAGE_SUMMARY_MODEL =
  process.env.OPENAI_STAGE_SUMMARY_MODEL ?? "gpt-4.1-mini";
const TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";
export const MAX_TRANSLATION_CHARACTERS = 4000;
export const MAX_TRANSCRIPTION_BYTES = 10 * 1024 * 1024;
export const MAX_STAGE_SUMMARY_CONTEXT_CHARACTERS = 5000;

type TranslationResponse = {
  sourceLanguageCode: string;
  sourceLanguageName: string;
  targetLanguageCode: string;
  translatedText: string;
};

type OpenAiErrorPayload = {
  error?: {
    message?: string;
  };
};

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  return apiKey;
}

function getOpenAiErrorMessage(payload: OpenAiErrorPayload | null, fallback: string) {
  return payload?.error?.message || fallback;
}

async function createStructuredChatCompletion<T>(input: {
  model?: string;
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  fallbackErrorMessage?: string;
  timeoutMs?: number;
}) {
  const response = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAiApiKey()}`,
    },
    body: JSON.stringify({
      model: input.model ?? TRANSLATION_MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
      messages: [
        {
          role: "system",
          content: input.systemPrompt,
        },
        {
          role: "user",
          content: input.userPrompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 30000),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as OpenAiErrorPayload | null;
    throw new Error(
      getOpenAiErrorMessage(
        payload,
        input.fallbackErrorMessage ?? "OpenAI request failed.",
      ),
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned an empty translation response.");
  }

  return JSON.parse(content) as T;
}

export async function translateTextWithOpenAI(input: {
  text: string;
  targetLanguageCode: string;
  targetLanguageName: string;
}) {
  const text = input.text.trim();

  if (!text) {
    throw new Error("Enter text to translate.");
  }

  if (text.length > MAX_TRANSLATION_CHARACTERS) {
    throw new Error(
      `Text is too long to translate at once. Keep it under ${MAX_TRANSLATION_CHARACTERS} characters.`,
    );
  }

  const targetLanguage =
    getSupportedLanguageByCode(input.targetLanguageCode) ??
    ({
      code: input.targetLanguageCode,
      name: input.targetLanguageName,
    } as const);

  const result = await createStructuredChatCompletion<TranslationResponse>({
    schemaName: "chat_translation_result",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        sourceLanguageCode: { type: "string" },
        sourceLanguageName: { type: "string" },
        targetLanguageCode: { type: "string" },
        translatedText: { type: "string" },
      },
      required: [
        "sourceLanguageCode",
        "sourceLanguageName",
        "targetLanguageCode",
        "translatedText",
      ],
    },
    systemPrompt:
      "You are a professional translator for an internal project management chat. Detect the source language automatically and translate the text into the requested target language. Return strict JSON only. Use ISO 639-1 lowercase codes when possible.",
    userPrompt: JSON.stringify({
      targetLanguageCode: targetLanguage.code,
      targetLanguageName: targetLanguage.name,
      text,
    }),
  });

  return {
    sourceLanguageCode: result.sourceLanguageCode.toLowerCase(),
    sourceLanguageName: result.sourceLanguageName,
    targetLanguageCode: result.targetLanguageCode.toLowerCase(),
    translatedText: result.translatedText.trim(),
  };
}

export async function transcribeAudioWithOpenAI(input: {
  audioFile: File;
  targetLanguageCode: string;
  targetLanguageName: string;
}) {
  if (!input.audioFile.size) {
    throw new Error("Recorded audio is empty.");
  }

  if (input.audioFile.size > MAX_TRANSCRIPTION_BYTES) {
    throw new Error("The recorded audio is too large. Please keep recordings short.");
  }

  const formData = new FormData();
  formData.append("model", TRANSCRIPTION_MODEL);
  formData.append("file", input.audioFile, input.audioFile.name);
  formData.append("response_format", "json");

  const response = await fetch(`${OPENAI_API_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
    },
    body: formData,
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as OpenAiErrorPayload | null;
    throw new Error(getOpenAiErrorMessage(payload, "OpenAI transcription request failed."));
  }

  const payload = (await response.json()) as {
    text?: string;
    language?: string;
  };

  const transcriptOriginal = payload.text?.trim();

  if (!transcriptOriginal) {
    throw new Error("No speech was detected in the recording.");
  }

  const translation = await translateTextWithOpenAI({
    text: transcriptOriginal,
    targetLanguageCode: input.targetLanguageCode,
    targetLanguageName: input.targetLanguageName,
  });

  return {
    detectedSourceLanguage: translation.sourceLanguageName,
    detectedSourceLanguageCode:
      translation.sourceLanguageCode || payload.language?.toLowerCase() || "unknown",
    transcriptOriginal,
    translatedText: translation.translatedText,
    targetLanguageCode: translation.targetLanguageCode,
  };
}

export async function summarizeStageActivityWithOpenAI(input: {
  stageName: string;
  stageStatus: string;
  context: string;
}) {
  const context = input.context.trim();

  if (!context) {
    throw new Error("No stage activity was provided.");
  }

  if (context.length > MAX_STAGE_SUMMARY_CONTEXT_CHARACTERS) {
    throw new Error(
      `Stage activity context is too long. Keep it under ${MAX_STAGE_SUMMARY_CONTEXT_CHARACTERS} characters.`,
    );
  }

  const result = await createStructuredChatCompletion<{ summary: string }>({
    model: STAGE_SUMMARY_MODEL,
    schemaName: "stage_activity_summary",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
    systemPrompt:
      "Summarize the activity in this project stage in 1-2 short sentences for a project management stage card. Focus on what happened, files shared, decisions, feedback, and current status. Keep it professional and under 180 characters. Do not invent details. Return strict JSON only.",
    userPrompt: JSON.stringify({
      stageName: input.stageName,
      stageStatus: input.stageStatus,
      visibleStageHistory: context,
    }),
    fallbackErrorMessage: "OpenAI stage summary request failed.",
    timeoutMs: 20000,
  });

  return result.summary.trim();
}
