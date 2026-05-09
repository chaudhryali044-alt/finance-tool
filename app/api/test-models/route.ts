import { NextResponse } from "next/server";

export async function GET() {
  // Test DeepSeek exactly as specified
  let deepseekTest: Response;
  let deepseekResult: unknown;
  try {
    deepseekTest = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "Say hello in one word" }],
        max_tokens: 10,
      }),
    });
    deepseekResult = await deepseekTest.json();
  } catch (err) {
    return NextResponse.json({
      deepseek: {
        keyPresent: !!process.env.DEEPSEEK_API_KEY,
        keyPrefix: process.env.DEEPSEEK_API_KEY?.slice(0, 8),
        status: "fetch_error",
        response: { error: String(err) },
      },
      gemini: { error: "aborted — deepseek fetch threw" },
    });
  }

  // Test Gemini exactly as specified
  let geminiTest: Response;
  let geminiResult: unknown;
  try {
    geminiTest = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say hello in one word" }] }],
        }),
      }
    );
    geminiResult = await geminiTest.json();
  } catch (err) {
    return NextResponse.json({
      deepseek: {
        keyPresent: !!process.env.DEEPSEEK_API_KEY,
        keyPrefix: process.env.DEEPSEEK_API_KEY?.slice(0, 8),
        status: deepseekTest!.status,
        response: deepseekResult,
      },
      gemini: {
        keyPresent: !!process.env.GEMINI_API_KEY,
        keyPrefix: process.env.GEMINI_API_KEY?.slice(0, 8),
        status: "fetch_error",
        response: { error: String(err) },
      },
    });
  }

  return NextResponse.json({
    deepseek: {
      keyPresent: !!process.env.DEEPSEEK_API_KEY,
      keyPrefix: process.env.DEEPSEEK_API_KEY?.slice(0, 8),
      status: deepseekTest.status,
      response: deepseekResult,
    },
    gemini: {
      keyPresent: !!process.env.GEMINI_API_KEY,
      keyPrefix: process.env.GEMINI_API_KEY?.slice(0, 8),
      status: geminiTest.status,
      response: geminiResult,
    },
  });
}
