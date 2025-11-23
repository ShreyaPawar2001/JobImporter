

const axios = require('axios');
const xml2js = require('xml2js');

async function fetchFeed(url) {
  try {
    const resp = await axios.get(url, { timeout: 20000 });
    const xml = resp.data;

    const parser = new xml2js.Parser({
      explicitArray: true,     // ALWAYS return arrays → fix missing items
      mergeAttrs: true,
      trim: true,
    });

    const json = await parser.parseStringPromise(xml);

    // Try all possible RSS/ATOM structures
    const channel = json?.rss?.channel?.[0];
    const feed = json?.feed;

    let items = [];

    if (channel?.item) {
      items = channel.item;
    } else if (feed?.entry) {
      items = feed.entry;
    }

    return items || [];
  } catch (err) {
    console.error("XML PARSE ERROR:", err.message);
    return [];
  }
}

function normalizeItem(item) {
  const externalId =
    item.guid?.[0]?._ ||
    item.guid?.[0] ||
    item.id?.[0] ||
    item.link?.[0] ||
    item.title?.[0] ||
    JSON.stringify(item);

  return {
    externalId: String(externalId),
    title: item.title?.[0] || '',
    company: item.author?.[0] || '',
    location: item.location?.[0] || '',
    description: item.description?.[0] || item['content:encoded']?.[0] || '',
    raw: item
  };
}

module.exports = { fetchFeed, normalizeItem };
