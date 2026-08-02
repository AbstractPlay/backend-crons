// src/functions/records.ts
import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { GameFactory, addResource } from "@abstractplay/gameslib";
import { gunzipSync, strFromU8 } from "fflate";
import { load as loadIon } from "ion-js";
import i18next from "i18next";

// src/gameslibLocales.ts
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var enApgames = require2("@abstractplay/gameslib/locales/en/apgames.json");
var enApresults = require2("@abstractplay/gameslib/locales/en/apresults.json");

// src/locales/en/apback.json
var apback_default = {
  ChallengeBody: "{{challenger}} has challenged you to a game of {{- metaGame}}. Please visit https://play.abstractplay.com/ for more details.",
  ChallengeBodyComment: '{{challenger}} has challenged you to a game of {{- metaGame}} with note: "{{- comment}}" Please visit https://play.abstractplay.com/ for more details.',
  ChallengeRejectedBody: "{{quitter}} has declined the {{- metaGame}} challenge. The challenge has been removed.",
  ChallengeRejectedSubject: "AbstractPlay: Challenge rejected",
  ChallengeResponseComment: 'Your opponent commented: "{{- comment}}"',
  ChallengeRevokedBody: "{{name}} has revoked his {{- metaGame}} challenge.",
  ChallengeRevokedBodyComment: '{{name}} has revoked his {{- metaGame}} challenge and commented: "{{- comment}}"',
  ChallengeRevokedSubject: "AbstractPlay: challenge revoked",
  ChallengeSubject: "AbstractPlay: new challenge",
  DearPlayer: "Dear {{player}}",
  EmailOut: "The AbstractPlay system.",
  GameLink: "You can view the game at https://play.abstractplay.com/move/{{metaGame}}/0/{{gameId}}.",
  GameOverBody: "Your {{- metaGame}} game has ended.",
  GameOverLink: "For more details, including a game record you can archive, please visit https://play.abstractplay.com/move/{{metaGame}}/1/{{gameID}}.",
  GameOverRating: "Your new rating is {{rating}}.",
  GameOverResult_win: "You won!",
  GameOverResult_lose: "You lost.",
  GameOverResult_draw: "It was a draw.",
  GameOverScores: "Final scores were as follows: {{scores}}.",
  GameOverSubject: "AbstractPlay: game over",
  GameStartedBody: "The {{- metaGame}} challenge was accepted by all players and the game has started.",
  GameStartedSubject: "AbstractPlay: game started",
  PUSH: {
    titles: {
      challenged: "Challenged",
      declined: "Challenge declined",
      ended: "Game over",
      revoked: "Challenge revoked",
      started: "Game started",
      yourturn: "Your turn",
      tournament: "Tournament started",
      tournamentOver: "Tournament ended"
    }
  },
  YourMove: "It is your turn to move.",
  YourMoveBatchedBody_one: "It's your turn in {{ count }} game. Visit https://play.abstractplay.com to take your turns.",
  YourMoveBatchedBody_other: "It's your turn in {{ count }} games. Visit https://play.abstractplay.com to take your turns.",
  YourMoveBatchedBodyUrgent_one: "It's your turn in {{ count }} game. At least one game has less than 24 hours left on the clock. Visit https://play.abstractplay.com to take your turns.",
  YourMoveBatchedBodyUrgent_other: "It's your turn in {{ count }} games. At least one game has less than 24 hours left on the clock. Visit https://play.abstractplay.com to take your turns.",
  YourMoveBody: "It is now your move in a game of {{- metaGame}}. Please visit https://play.abstractplay.com/ for more details.",
  YourMoveSubject: "AbstractPlay: your move",
  YourMoveSubjectUrgent: "AbstractPlay: your move (urgent)",
  TournamentStartBody: "Tournament {{number}} of the {{- metaGame}} series has started. See https://play.abstractplay.com/tournaments. You are also registered for the next tournament in the series. It will start one week after this tournament ends.",
  TournamentStartBodyVariants: "Tournament {{number}} of the {{- metaGame}}, variants: {{variants}} series has started. See https://play.abstractplay.com/tournaments. You are also registered for the next tournament in the series. It will start one week after this tournament ends.",
  TournamentStartSubject: "Your {{- metaGame}} tournament has started",
  TournamentCancelBody: "Not enough players signed up for Tournament {{number}} of the {{- metaGame}} series and the tournament had to be cancelled.",
  TournamentCancelBodyVariants: "Not enough players signed up for Tournament {{number}} of the {{- metaGame}}, variants: {{variants}} series and the tournament had to be cancelled.",
  TournamentCancelSubject: "Your {{- metaGame}} tournament was cancelled",
  TournamentEndBody: "Tournament {{number}} of the {{- metaGame}} series has ended. See https://play.abstractplay.com/tournament/{{tournamentId}}. The next tournament in the series will start in one week.",
  TournamentEndBodyVariants: "Tournament {{number}} of the {{- metaGame}}, variants: {{variants}} series has ended. See https://play.abstractplay.com/tournament/{{tournamentId}}. The next tournament in the series will start in one week.",
  TournamentEndSubject: "Your {{- metaGame}} tournament has ended",
  TournamentRemoveBody: "You were removed from the {{- metaGame}} tournament you were signed up for, because it is unclear whether you are still interested. If you would still like to participate, please sign up again at https://play.abstractplay.com/tournaments.",
  TournamentRemoveBodyVariants: "You were removed from the {{- metaGame}}, variants: {{variants}} tournament you were signed up for, because it is unclear whether you are still interested. If you would still like to participate, please sign up again at https://play.abstractplay.com/tournaments.",
  TournamentRemoveSubject: "You were removed from a tournament"
};

// src/functions/records.ts
var REGION = "us-east-1";
var s3 = new S3Client({ region: REGION });
var DUMP_BUCKET = "abstractplay-db-dump";
var REC_BUCKET = "records.abstractplay.com";
var LEGACY_BOT_ID = "SkQfHAjeDxs8eeEnScuYA";
var handler = async (event, context) => {
  const i18nInstance = i18next;
  await i18nInstance.init({
    ns: ["apback"],
    defaultNS: "apback",
    lng: "en",
    fallbackLng: "en",
    debug: true,
    resources: {
      en: {
        apback: apback_default
      }
    }
  }).then(async function() {
    if (!i18nInstance.isInitialized) {
      throw new Error(`i18n is not initialized where it should be!`);
    }
    addResource("en", void 0, {
      bundles: { apgames: enApgames, apresults: enApresults }
    });
    const command = new ListObjectsV2Command({
      Bucket: DUMP_BUCKET
    });
    const allContents = [];
    try {
      let isTruncatedOuter = true;
      while (isTruncatedOuter) {
        const { Contents, IsTruncated: IsTruncatedInner, NextContinuationToken } = await s3.send(command);
        if (Contents === void 0) {
          throw new Error(`Could not list the bucket contents`);
        }
        allContents.push(...Contents);
        isTruncatedOuter = IsTruncatedInner || false;
        command.input.ContinuationToken = NextContinuationToken;
      }
    } catch (err) {
      console.error(err);
    }
    const manifests = allContents.filter((c) => c.Key?.includes("manifest-summary.json"));
    manifests.sort((a, b) => b.LastModified.toISOString().localeCompare(a.LastModified.toISOString()));
    const latest = manifests[0];
    const match = latest.Key.match(/^AWSDynamoDB\/(\S+)\/manifest-summary.json$/);
    if (match === null) {
      throw new Error(`Could not extract uid from "${latest.Key}"`);
    }
    const uid = match[1];
    const dataFiles = allContents.filter((c) => c.Key?.includes(`${uid}/data/`) && c.Key?.endsWith(".ion.gz"));
    console.log(`Found the following matching data files:
${JSON.stringify(dataFiles, null, 2)}`);
    const justGames = [];
    const tournaments = [];
    const events = [];
    const eventGames = [];
    const registeredBots = /* @__PURE__ */ new Set([LEGACY_BOT_ID]);
    for (const file of dataFiles) {
      console.log(`Loading ${file.Key}`);
      const command2 = new GetObjectCommand({
        Bucket: DUMP_BUCKET,
        Key: file.Key
      });
      try {
        const response2 = await s3.send(command2);
        const bytes = await response2.Body?.transformToByteArray();
        if (bytes !== void 0) {
          const ion = gunzipSync(bytes);
          console.log(`Processing ${ion.length} bytes`);
          let sofar = "";
          let ptr = 0;
          const chunk = 1e6;
          while (ptr < ion.length) {
            sofar += strFromU8(ion.slice(ptr, ptr + chunk));
            while (sofar.includes("}}\n")) {
              const idx = sofar.indexOf("}}\n");
              const line = sofar.substring(0, idx + 2);
              sofar = sofar.substring(idx + 3);
              try {
                const outerRec = loadIon(line);
                if (outerRec === null) {
                  console.log(`Could not load ION record, usually because of an empty line.
Offending line: "${line}"`);
                } else {
                  const json = JSON.parse(JSON.stringify(outerRec));
                  const rec = json.Item;
                  if (rec.pk === "GAME" && rec.sk.includes("#1#")) {
                    justGames.push(rec);
                  } else if (rec.pk === "TOURNAMENT" || rec.pk === "COMPLETEDTOURNAMENT") {
                    tournaments.push(rec);
                  } else if (rec.pk === "ORGEVENT") {
                    events.push(rec);
                  } else if (rec.pk === "ORGEVENTGAME") {
                    eventGames.push(rec);
                  } else if (rec.pk === "BOT") {
                    registeredBots.add(rec.sk);
                  }
                }
              } catch (err) {
                console.log(`An error occurred while loading an ION record: ${line}`);
                console.error(err);
              }
            }
            ptr += chunk;
          }
        } else {
          throw new Error(`Could not load bytes from ${file.Key}`);
        }
      } catch (err) {
        console.log(`An error occured while reading data files. The specific file was ${JSON.stringify(file)}`);
        console.error(err);
      }
    }
    console.log(`Found ${justGames.length} completed GAME records`);
    console.log(`Found ${registeredBots.size} registered bots`);
    const pushToMap = (m, key, value) => {
      if (m.has(key)) {
        const current = m.get(key);
        m.set(key, [...current, value]);
      } else {
        m.set(key, [value]);
      }
    };
    const allRecs = [];
    const metaRecs = /* @__PURE__ */ new Map();
    const userRecs = /* @__PURE__ */ new Map();
    const eventRecs = /* @__PURE__ */ new Map();
    for (const gdata of justGames) {
      const g = GameFactory(gdata.metaGame, gdata.state);
      if (g === void 0) {
        throw new Error(`Unable to instantiate ${gdata.metaGame} game ${gdata.id}:
${JSON.stringify(gdata.state)}`);
      }
      let event2 = null;
      let round = null;
      if (gdata.tournament !== void 0) {
        const trec = tournaments.find((t) => t.id === gdata.tournament);
        if (trec !== void 0) {
          event2 = `Automated Tournament #${trec.number} (${trec.sk})`;
          round = "1";
        } else {
          console.log(`Could not find a matching tournament record for game record "${gdata.sk}".`);
        }
      } else if (gdata.event !== void 0) {
        const erec = events.find((e) => e.sk === gdata.event);
        const egrec = eventGames.find((eg) => eg.sk === [gdata.event, gdata.id].join("#"));
        if (erec !== void 0 && egrec !== void 0) {
          event2 = erec.name;
          round = egrec.round.toString();
        } else {
          console.log(`Could not find a matching event records for game record "${gdata.sk}".`);
        }
      }
      const rec = g.genRecord({
        uid: `${g.metaGame}#${gdata.id}`,
        players: gdata.players.map((p) => ({
          uid: p.id,
          name: p.name,
          isai: registeredBots.has(p.id) ? true : void 0
        })),
        event: event2 !== null ? event2 : void 0,
        round: round !== null ? round : void 0
      });
      if (rec === void 0) {
        throw new Error(`Unable to create a game report for ${gdata.metaGame} game ${gdata.id}:
${JSON.stringify(gdata.state)}`);
      }
      if (gdata.pieInvoked !== void 0 && gdata.pieInvoked) {
        rec.header.pied = true;
      }
      allRecs.push(rec);
      pushToMap(metaRecs, gdata.metaGame, rec);
      for (const p of gdata.players) {
        pushToMap(userRecs, p.id, rec);
      }
      if (event2 !== null) {
        let id;
        if (gdata.tournament !== void 0) {
          id = gdata.tournament;
        } else if (gdata.event !== void 0) {
          id = gdata.event;
        }
        if (id !== void 0) {
          pushToMap(eventRecs, id, rec);
        }
      }
    }
    console.log(`allRecs: ${allRecs.length}, metaRecs: ${[...metaRecs.keys()].length}, userRecs: ${[...userRecs.keys()].length}, eventRecs: ${[...eventRecs.keys()].length}`);
    const bodyAll = JSON.stringify(allRecs);
    let cmd = new PutObjectCommand({
      Bucket: REC_BUCKET,
      Key: "ALL.json",
      Body: bodyAll
    });
    let response = await s3.send(cmd);
    if (response["$metadata"].httpStatusCode !== 200) {
      console.log(response);
    }
    console.log("All records done");
    for (const [meta, recs] of metaRecs.entries()) {
      cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `meta/${meta}.json`,
        Body: JSON.stringify(recs)
      });
      response = await s3.send(cmd);
      if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
      }
    }
    console.log("Meta games done");
    for (const [player, recs] of userRecs.entries()) {
      cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `player/${player}.json`,
        Body: JSON.stringify(recs)
      });
      response = await s3.send(cmd);
      if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
      }
    }
    console.log("Player recs done");
    for (const [eventid, recs] of eventRecs.entries()) {
      cmd = new PutObjectCommand({
        Bucket: REC_BUCKET,
        Key: `event/${eventid}.json`,
        Body: JSON.stringify(recs)
      });
      response = await s3.send(cmd);
      if (response["$metadata"].httpStatusCode !== 200) {
        console.log(response);
      }
    }
    console.log("Event recs done");
    console.log("ALL DONE");
  }).catch((err) => {
    throw new Error(`An error occurred while initializing i18next:
${err}`);
  });
};
export {
  handler
};
