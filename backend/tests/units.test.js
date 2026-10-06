process.env.NODE_ENV = 'test';
const vectorStore = require('../src/services/vectorStoreService');
const weather = require('../src/services/weatherService');

describe('Local embedder & chunking', () => {
  test('similar agricultural text scores higher than unrelated text', () => {
    const q = vectorStore._localEmbed('why are my wheat leaves turning yellow');
    const related = vectorStore._localEmbed('Yellowing of wheat leaves has several common causes including nitrogen deficiency');
    const unrelated = vectorStore._localEmbed('Soybean harvest moisture and storage of pods');
    expect(vectorStore._cosine(q, related)).toBeGreaterThan(vectorStore._cosine(q, unrelated));
  });

  test('long text is split into overlapping chunks', () => {
    const long = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} about irrigation.`).join(' ');
    const chunks = vectorStore.chunkText(long, 500, 80);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 520)).toBe(true);
  });
});

describe('Weather alerts', () => {
  const forecast = (chance) => ({ forecast: [{ label: 'Today', chanceOfRain: 10, totalPrecipMm: 0, maxC: 30, minC: 20, maxWindKph: 10 }, { label: 'Tomorrow', chanceOfRain: chance, totalPrecipMm: 5, maxC: 30, minC: 20, maxWindKph: 10 }] });
  test('creates a rain alert for a high probability and none for a low one', () => {
    expect(weather.buildAlerts(forecast(70))[0].type).toBe('rain');
    expect(weather.buildAlerts(forecast(20))).toHaveLength(0);
  });
  test('alert text is general guidance, not a command', () => {
    expect(weather.buildAlerts(forecast(90))[0].message).toMatch(/Consider/);
  });
});
