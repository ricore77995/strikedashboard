**✅ Aqui está o código atualizado e completo em Node.js com Fuzzysort**, agora incluindo os novos bloqueios por **Audio Features** do Spotify.

```javascript
const fuzzysort = require('fuzzysort');

// === BLACKLIST ATUALIZADA ===
const blacklistTerms = [
  "christian worship", "worship", "ambient", "sleep", "meditation",
  "lo-fi", "chillhop", "chillwave", "new age", "yoga music",
  "sound healing", "acoustic", "kids music", "children's music",
  "lullaby", "disney", "infantil", "karaokê", "fado", "fadista",
  "kizomba", "tarraxinha", "semba", "pimba", "forró",
  "sertanejo romântico", "modão", "brega", "bossa nova",
  "smooth jazz", "mpb lenta", "reggaeton", "bachata", "salsa",
  "cumbia", "funk carioca", "funk putaria", "brega funk",
  "funk melody", "funk 150", "porn funk", "mandelão",
  "anitta", "ludmilla", "marília mendonça", "gusttavo lima",
  "ed sheeran", "adele", "shawn mendes", "mariza", "camané",
  "antónio zambujo", "nelson freitas", "anselmo ralph", "yuri da cunha",
  "dillaz", "bispo", "prodigio", "piruka", "slow j",
  "portuguese hip hop", "rap português", "trap português",
  "sad rap", "explicit", "putaria", "sofrência", "desabafo",
  "slow", "chill", "acústico", "remix lento", "versão acústica"
];

// Função de limpeza de texto
function cleanText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\s*feat\..*|\s*ft\..*|\s*\(.*?\)/g, '')
    .replace(/[^a-záàâãéèêíóôõúç0-9\s]/g, '')
    .trim();
}

// === FUNÇÃO PRINCIPAL DE BLOQUEIO ===
function isBlocked(track) {
  if (!track) return true;

  const trackName = track.name || '';
  const artistName = track.artists?.[0]?.name || '';
  const genres = track.genres || [];
  const tempo = track.tempo || null;
  const energy = track.energy || null;
  const valence = track.valence || null;
  const danceability = track.danceability || null;
  const speechiness = track.speechiness || null;
  const explicit = track.explicit || false;

  const texts = [];
  if (trackName) texts.push(cleanText(trackName));
  if (artistName) texts.push(cleanText(artistName));
  if (genres.length) genres.forEach(g => texts.push(cleanText(g)));

  // 1. Verificação Exata
  for (const text of texts) {
    if (blacklistTerms.includes(text)) {
      console.log(`[BLOCKED] Match exato: ${text}`);
      return true;
    }
  }

  // 2. Fuzzy Matching com Fuzzysort
  for (const text of texts) {
    if (!text) continue;
    const result = fuzzysort.go(text, blacklistTerms, {
      threshold: -10000,   // Ajusta aqui se quiseres mais/menos sensível
      limit: 1
    });

    if (result.length > 0) {
      console.log(`[BLOCKED] Fuzzy: "${text}" → "${result[0].target}"`);
      return true;
    }
  }

  // 3. Bloqueios por Audio Features
  if (tempo !== null && tempo < 115) {
    console.log(`[BLOCKED] BPM baixo: ${tempo}`);
    return true;
  }
  if (energy !== null && energy < 0.55) {
    console.log(`[BLOCKED] Energia baixa: ${energy}`);
    return true;
  }
  if (valence !== null && valence < 0.35) {
    console.log(`[BLOCKED] Valence baixo (triste): ${valence}`);
    return true;
  }
  if (danceability !== null && danceability < 0.45) {
    console.log(`[BLOCKED] Pouco dançável: ${danceability}`);
    return true;
  }
  if (speechiness !== null && speechiness > 0.45) {
    console.log(`[BLOCKED] Speechiness alto (muita fala): ${speechiness}`);
    return true;
  }
  if (explicit) {
    console.log(`[BLOCKED] Conteúdo explícito`);
    return true;
  }

  return false;
}

module.exports = { isBlocked };
```

### Como usar:

```javascript
const { isBlocked } = require('./blacklistFilter');

if (isBlocked(track)) {
  // Pular música e escolher outra
  console.log(`Música bloqueada: ${track.name} - ${track.artists[0].name}`);
}
```

**Quer ajustes?**
- Mudar os valores dos thresholds (BPM, energy, etc.)?
- Tornar o fuzzy mais/menos agressivo?
- Adicionar mais artistas ou termos?

É só dizer!