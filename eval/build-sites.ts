import { readFileSync, writeFileSync } from "node:fs";

const blocked = /porn|xxx|sex|xvideo|xnxx|xhamster|redtube|youporn|onlyfans|adult|escort|nude|cam4|chaturbate|casino|bet|poker|gambl|slot|lotto|bingo|jackpot|bwin|1xbet|stake|wager/i;
const step = 50;
const slots = 120;

const euNews = [
  "lemonde.fr",
  "spiegel.de",
  "bbc.com",
  "theguardian.com",
  "corriere.it",
  "elpais.com",
  "zalando.de",
  "lefigaro.fr",
  "bild.de",
  "repubblica.it",
  "elmundo.es",
  "welt.de",
  "faz.net",
  "zeit.de",
  "telegraph.co.uk",
  "dailymail.co.uk",
  "independent.co.uk",
  "marca.com",
  "lequipe.fr",
  "20minutes.fr",
  "ouest-france.fr",
  "nos.nl",
  "nu.nl",
  "tagesschau.de",
  "otto.de",
  "cdiscount.com",
  "fnac.com",
  "bol.com",
  "asos.com",
  "ikea.com",
];

const ranked = readFileSync(process.argv[2], "utf8")
  .split("\n")
  .filter(Boolean)
  .slice(0, 6000)
  .map((line) => line.split(",")[1].trim());

const taken = new Set<string>(euNews);
const sampled: string[] = [];
for (let slot = 1; slot <= slots; slot++) {
  let index = slot * step - 1;
  while (index < ranked.length && (blocked.test(ranked[index]) || taken.has(ranked[index]))) index++;
  taken.add(ranked[index]);
  sampled.push(ranked[index]);
}

writeFileSync("sites.txt", [...sampled, ...euNews].join("\n") + "\n");
console.log(sampled.length + euNews.length);
