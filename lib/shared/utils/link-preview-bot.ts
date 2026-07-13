/** Crawlers that fetch URLs for chat/social link previews (no auth cookies). */
const LINK_PREVIEW_BOT_UA_RE =
  /facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|TelegramBot|Applebot|bingbot|BingPreview|Googlebot|Google-Extended|ia_archiver|redditbot/i;

export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return LINK_PREVIEW_BOT_UA_RE.test(userAgent);
}
