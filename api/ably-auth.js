const Ably = require("ably");

module.exports = async (req, res) => {
  const clientId = typeof req.query.clientId === "string" ? req.query.clientId : "";
  const apiKey = process.env.ABLY_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "Missing ABLY_API_KEY environment variable." });
    return;
  }

  if (!clientId) {
    res.status(400).json({ error: "Missing clientId query parameter." });
    return;
  }

  try {
    const ably = new Ably.Rest(apiKey);
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId,
      capability: {
        "room:*": ["publish", "subscribe", "presence"],
      },
    });

    res.status(200).json(tokenRequest);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to create Ably token request." });
  }
};
