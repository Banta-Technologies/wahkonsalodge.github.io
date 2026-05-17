import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const requesterTypes = new Set(["Student", "Teacher", "Parent", "Other"]);
const purposes = new Set([
  "Just for fun",
  "Classroom activity",
  "Holiday/event",
  "Science topic",
  "History/social studies topic",
  "Other",
]);
const gradeRanges = new Set([
  "",
  "Pre-K",
  "K-2",
  "3-5",
  "6-8",
  "High school",
  "Adult",
  "Not applicable",
]);
const stylePreferences = new Set([
  "Simple coloring book",
  "Cute cartoon",
  "Realistic outline",
  "Funny/silly",
  "Nature-themed",
  "Vehicle/mechanical",
  "Storybook style",
]);

const rateLimit = new Map();
const windowMs = 10 * 60 * 1000;
const maxRequestsPerWindow = 5;

const ses = new SESv2Client({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
});

export async function handler(event) {
  const headers = corsHeaders(event);

  if (event.requestContext?.http?.method === "OPTIONS") {
    return response(204, "", headers);
  }

  if (event.requestContext?.http?.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, headers);
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid request" }, 400, headers);
  }

  // Honeypot: bots may fill this hidden field. Return success without sending email.
  if (clean(payload.website)) {
    return json({ ok: true }, 200, headers);
  }

  const ipAddress = getIpAddress(event);
  if (isRateLimited(ipAddress)) {
    return json({ error: "Too many requests" }, 429, headers);
  }

  if (process.env.TURNSTILE_SECRET_KEY) {
    const captchaOk = await verifyTurnstile(
      payload.turnstileToken,
      process.env.TURNSTILE_SECRET_KEY,
      ipAddress
    );

    if (!captchaOk) {
      return json({ error: "Captcha verification failed" }, 400, headers);
    }
  }

  const validation = validatePayload(payload);
  if (!validation.ok) {
    return json({ error: validation.error }, 400, headers);
  }

  const submittedAt = new Date().toISOString();
  const userAgent = clean(event.headers?.["user-agent"] || "Unavailable", 500);
  const emailBody = buildEmailBody({
    ...validation.data,
    submittedAt,
    userAgent,
    ipAddress,
  });

  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress:
          process.env.EMAIL_FROM ||
          "Wahkonsa Lodge <no-reply@wahkonsalodge.com>",
        Destination: {
          ToAddresses: [process.env.EMAIL_TO || "vlbanta@gmail.com"],
        },
        ReplyToAddresses: validation.data.replyEmail
          ? [validation.data.replyEmail]
          : undefined,
        Content: {
          Simple: {
            Subject: {
              Data: "New Wahkonsa Lodge Coloring Page Request",
              Charset: "UTF-8",
            },
            Body: {
              Text: {
                Data: emailBody,
                Charset: "UTF-8",
              },
            },
          },
        },
      })
    );
  } catch (error) {
    console.error("SES send failed", error);
    return json({ error: "Email failed" }, 500, headers);
  }

  return json({ ok: true }, 200, headers);
}

function validatePayload(payload) {
  const requesterType = clean(payload.requesterType, 80);
  const idea = clean(payload.idea, 1200);
  const purpose = clean(payload.purpose, 80);
  const gradeRange = clean(payload.gradeRange, 80);
  const replyEmail = clean(payload.replyEmail, 254);
  const selectedStyles = Array.isArray(payload.stylePreferences)
    ? payload.stylePreferences.map((style) => clean(style, 80))
    : [];

  if (!requesterTypes.has(requesterType)) {
    return { ok: false, error: "Requester type is required" };
  }

  if (!idea) {
    return { ok: false, error: "Coloring page idea is required" };
  }

  if (!purposes.has(purpose)) {
    return { ok: false, error: "Purpose is required" };
  }

  if (!gradeRanges.has(gradeRange)) {
    return { ok: false, error: "Invalid grade or age range" };
  }

  const invalidStyle = selectedStyles.find((style) => !stylePreferences.has(style));
  if (invalidStyle) {
    return { ok: false, error: "Invalid style preference" };
  }

  if (replyEmail && !isEmail(replyEmail)) {
    return { ok: false, error: "Invalid email address" };
  }

  return {
    ok: true,
    data: {
      requesterType,
      idea,
      purpose,
      gradeRange: gradeRange || "Not provided",
      stylePreferences: selectedStyles.length ? selectedStyles : ["Not provided"],
      replyEmail,
    },
  };
}

async function verifyTurnstile(token, secret, ipAddress) {
  if (!token) {
    return false;
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  if (ipAddress && ipAddress !== "Unavailable") {
    body.set("remoteip", ipAddress);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!response.ok) {
    return false;
  }

  const result = await response.json();
  return result.success === true;
}

function buildEmailBody(data) {
  return [
    "New Wahkonsa Lodge Coloring Page Request",
    "",
    `Requester type: ${data.requesterType}`,
    `Coloring page idea: ${data.idea}`,
    `Purpose: ${data.purpose}`,
    `Grade/age range: ${data.gradeRange}`,
    `Style preferences: ${data.stylePreferences.join(", ")}`,
    `Optional reply email: ${data.replyEmail || "Not provided"}`,
    `Submitted timestamp: ${data.submittedAt}`,
    `User agent: ${data.userAgent}`,
    `IP address: ${data.ipAddress}`,
  ].join("\n");
}

function clean(value, maxLength = 200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getIpAddress(event) {
  return (
    event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.requestContext?.http?.sourceIp ||
    "Unavailable"
  );
}

function isRateLimited(key) {
  if (!key || key === "Unavailable") {
    return false;
  }

  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > maxRequestsPerWindow;
}

function corsHeaders(event) {
  const origin = event.headers?.origin || "";
  const allowedOrigin = process.env.ALLOWED_ORIGIN || "https://wahkonsalodge.com";

  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body, statusCode, headers) {
  return response(statusCode, JSON.stringify(body), {
    ...headers,
    "Content-Type": "application/json",
  });
}

function response(statusCode, body, headers) {
  return {
    statusCode,
    headers,
    body,
  };
}
