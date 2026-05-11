# User Onboarding & Friction-Reduction Strategy

To ensure successful early adoption and prevent user drop-off due to technical friction (e.g., API key configuration), we are implementing a dual-track onboarding strategy. The goal is to let users experience the "Aha Moment" within 3 minutes of opening the app.

## Track 1: Limited Zero-Config Trial Mode (The "Hook")
**Goal:** Allow users to use the core Transform feature immediately without any configuration.

*   **Implementation:** We will deploy a public-facing instance backed by our own API keys (using cost-effective models like Gemini 1.5 Flash or DeepSeek).
*   **Access Control (Anti-Abuse):** Implement a lightweight rate limit based on IP or browser fingerprinting (e.g., via Vercel KV, Upstash, or Cloudflare). Limit to ~5 transformations or 10 roleplay turns per user per day.
*   **Conversion Path:** When the user exhausts their free quota, present a friendly modal: "You've reached the free trial limit. CoreFirst is an open-source tool! Simply configure your own API key to unlock unlimited, forever-free access." This smoothly transitions them to Track 2.

## Track 2: Idiot-Proof API Key Onboarding
**Goal:** Make bringing your own key (BYOK) completely painless, even for non-technical users.

*   **Guided UI:** Replace the standard API key input with a step-by-step interactive guide.
*   **Recommended Providers:** Direct users to providers with generous free tiers and easy social logins (e.g., OpenRouter, Groq, or localized providers).
*   **Visual Tutorials:** Embed a 30-second looping GIF showing exactly where to click, copy, and paste the key.
*   **Instant Verification:** Upon pasting the key, automatically fire a silent `ping` request to the provider. 
    *   *Success:* Show a clear success state (e.g., confetti animation).
    *   *Failure:* Provide plain-English troubleshooting (e.g., "We couldn't connect. Please check your network or ensure your account has sufficient balance/credits.") instead of cryptic network errors.
