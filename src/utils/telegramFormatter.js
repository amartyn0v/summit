const escapeMarkdownV2 = (text) => {
  if (!text) return '';
  return text.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1');
};

const buildSummaryMessage = (summary) => {
  const sourceUrl = summary.sourceUrl || summary.source_url;
  const parts = [];
  if (summary.title) {
    parts.push(`*${escapeMarkdownV2(summary.title)}*`);
  }
  if (summary.summary) {
    parts.push(escapeMarkdownV2(summary.summary));
  }
  if (sourceUrl) {
    parts.push(`Источник: ${escapeMarkdownV2(sourceUrl)}`);
  }
  return parts.join('\n\n');
};

module.exports = {
  escapeMarkdownV2,
  buildSummaryMessage,
};
