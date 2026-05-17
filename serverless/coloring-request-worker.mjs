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

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, corsHeaders);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid request" }, 400, corsHeaders);
    }

    // Honeypot: bots may fill this hidden field. Return success without sending email.
    if (clean(payload.website)) {
      return json({ ok: true }, 200, corsHeaders);
    }

    const ipAddress = getIpAddress(request);
    if (isRateLimited(ipAddress)) {
      return json({ error: "Too many requests" }, 429, corsHeaders);
    }

    const validation = validatePayload(payload);
    if (!validation.ok) {
      return json({ error: validation.error }, 400, corsHeaders);
    }

    if (!env.RESEND_API_KEY) {
      return json({ error: "Email is not configured" }, 500, corsHeaders);
    }

    const submittedAt = new Date().toISOString();
    const userAgent = clean(request.headers.get("user-agent") ?? "Unavailable", 500);
    const emailBody = buildEmailBody({
      ...validation.data,
      submittedAt,
      userAgent,
      ipAddress,
    });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Wahkonsa Lodge <no-reply@wahkonsalodge.com>",
        to: env.EMAIL_TO || "vlbanta@gmail.com",
        reply_to: validation.data.replyEmail || undefined,
        subject: "New Wahkonsa Lodge Coloring Page Request",
        text: emailBody,
      }),
    });

    if (!response.ok) {
      return json({ error: "Email failed" }, 500, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  },
};

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

function getIpAddress(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
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

function getCorsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = env.ALLOWED_ORIGIN || "https://wahkonsalodge.com";

  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin ? origin : allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  });
}
