import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT || 8787);

const defaultModel = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini";
const azureEndpoint = (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
const azureKey = process.env.AZURE_OPENAI_KEY || "";

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    providers: {
      azure: { endpoint: azureEndpoint, configured: Boolean(azureKey) },
    },
  });
});

app.post("/api/llm/chat", async (req, res) => {
  const provider = (req.body?.provider || "azure").toLowerCase();
  const model = req.body?.model || defaultModel;
  const apiKey = req.body?.apiKey || "";
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const temperature = Number.isFinite(req.body?.temperature) ? req.body.temperature : 0.3;

  if (!messages.length) {
    return res.status(400).json({ error: "messages is required" });
  }

  if (provider !== "azure") {
    return res.status(400).json({ error: "Only Azure OpenAI provider is supported" });
  }

  return handleAzureOpenAI(res, model, messages, temperature, apiKey);
});

async function handleAzureOpenAI(res, deploymentName, messages, temperature, apiKey) {
  if (!azureEndpoint) {
    return res.status(400).json({ error: "Azure endpoint not configured" });
  }

  const effectiveKey = apiKey || azureKey;
  if (!effectiveKey) {
    return res.status(400).json({ error: "Azure API key not provided or configured" });
  }

  try {
    const url = `${azureEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": effectiveKey,
      },
      body: JSON.stringify({
        messages,
        temperature,
        max_tokens: 2048,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Azure OpenAI call failed",
        raw: data,
      });
    }

    const content = data?.choices?.[0]?.message?.content || "";
    return res.json({
      content,
      usage: data?.usage ? {
        prompt_tokens: data.usage.prompt_tokens ?? null,
        completion_tokens: data.usage.completion_tokens ?? null,
      } : null,
      model: deploymentName,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Azure OpenAI proxy error",
    });
  }
}

app.listen(port, () => {
  console.log(`[LLM Proxy] listening on http://localhost:${port}`);
  console.log(`[LLM Proxy] provider: Azure OpenAI only`);
});
