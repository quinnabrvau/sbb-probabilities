#!/usr/bin/env node
const { XMLHttpRequest } = require("xmlhttprequest");
const jsonfile = require('jsonfile');
const fs = require('fs');

const latestRequest = new XMLHttpRequest();
const cardsRequest = new XMLHttpRequest();

let patchNumber = '';

const updateMinionsJSFile = (cardsArray) => {
    // Sort cards first on tier, then alphabetically.
    cardsArray = cardsArray.sort((a, b) => {
        if (a.techLevel > b.techLevel) return 1;
        if (a.techLevel < b.techLevel) return -1;

        return a.name.localeCompare(b.name)
    });

    const typeMap = {
        BEAST: "Beast",
        DEMON: "Demon",
        DRAGON: "Dragon",
        ELEMENTAL: "Elemental",
        MECHANICAL: "Mech",
        MURLOC: "Murloc",
        PIRATE: "Pirate"
    };
    typeMap["ALL"] = Object.values(typeMap).join(', ');

    const keywordsMap = {
        BATTLECRY: "Battlecry",
        CHARGE: "Charge",
        DEATHRATTLE: "Deathrattle",
        DISCOVER: "Discover",
        DIVINE_SHIELD: "Divine Shield",
        FREEZE: "Freeze",
        IMMUNE: "Immune",
        MODULAR: "Magnetic",
        OVERKILL: "Overkill",
        POISONOUS: "Poisonous",
        REBORN: "Reborn",
        TAUNT: "Taunt",
        WINDFURY: "Windfury"
    }
    
    const getKeywords = (card) => {
        const keywords = [];

        const mechanics = card["mechanics"]
        if (mechanics) {
            mechanics.forEach((mechanic) => keywordsMap[mechanic] && keywords.push(keywordsMap[mechanic]));
        }
        
        const tags = card["referencedTags"];
        if (tags) {
            tags.forEach((tag) => keywordsMap[tag] && keywords.push(keywordsMap[tag]));
        }

        return keywords;
    };

    const typeMapClone = Object.assign({}, typeMap);
    delete typeMapClone.ALL;
    const validTypes = Object.values(typeMapClone);

    const validKeywords = [`(?<!^(\\[x\\]<b>|<b>))${keywordsMap.TAUNT}`]; // Don't count a taunt synergy if it has taunt.

    const validSynergies = validTypes.concat(validKeywords);
    const synergyRegex = new RegExp(`\\b(?:${validSynergies.join('|')})`, 'g');
    const getSynergies = (card) => {
        let synergies = [];
        const type = typeMap[card["race"]];
        const text = card["text"];

        // Only type-less minions count for synergy
        if (text && !type) {
            synergies = text.match(synergyRegex) || [];

            // Check for Lightfang
            const isLightFang = text.match(/each minion type/gi);
            if (isLightFang) {
                synergies.push(typeMap["ALL"]);
            }

            // Filter out duplicates.
            synergies = [...new Set(synergies)];
        }

        return synergies;
    };

    let formattedMinions = cardsArray.map((card) => {
        const type = typeMap[card["race"]];
        const keywords = getKeywords(card);
        const synergies = getSynergies(card);
        // Filter out duplicates between keywords and synergies.
        const keywordsAndSynergies = synergies.length ? synergies.concat(keywords) : keywords;
        const combined = [...new Set(keywordsAndSynergies)];
        if (type) {
            combined.unshift(type);
        }

        const formattedMinion = {
            "Name": card["name"],
            "Tier": card["techLevel"].toString(),
            "Attack": card["attack"].toString(),
            "Health": card["health"].toString(),
            "Cost": card["cost"].toString(),
            "Legendary": card["elite"] && "Y",
            "Type": type,
            "Keywords": keywords.length ? keywords.join(', ') : undefined,
            "Synergy": synergies.length ? synergies.join(', ') : undefined,
            "Combined": combined.join(', '),
            "ID": card["id"]
        };

        // Remove keys with undefined values
        Object.keys(formattedMinion).forEach(key => formattedMinion[key] === undefined && delete formattedMinion[key]);

        return formattedMinion;
    });

    fs.writeFile(
        "./src/minions.js",
        `const minions = ${JSON.stringify(formattedMinions, null, 4)}\n\nexport default minions;`,
        (err) => err ? console.log(err) : console.log("The minions.js file has been updated. 🙌 🎉 🙌 🎉")
    );
};

const updateCardsJsonFile = () => {
    const cardsArray = JSON.parse(cardsRequest.responseText);
    
    // Filter for only BG minions
    const bgCardsArray = []
    cardsArray.forEach((card) => {
        // Retired BG minions don't have a techLevel anymore
        if(card["techLevel"]) {
            bgCardsArray.push(card)
        }
    });

    jsonfile.writeFile(
        "./src/assets/cards.json",
        bgCardsArray.map((card) => ({ id: card["id"], name: card["name"] })),
        { spaces: 2 },
        (err) => err ? console.log(err) : console.log("The cards.json has been updated. 🙌 🎉 🙌 🎉")
    );

    updateMinionsJSFile(bgCardsArray);
}

latestRequest.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        // Grab the latest patch number from response content.
        patchNumber = this.responseText.match(/v1\/(\d+)/g)[0].substring(3);

        // Send another request to get the cards json.
        const url = `https://api.hearthstonejson.com/v1/${patchNumber}/enUS/cards.json`;

        cardsRequest.open("GET", url, true);
        cardsRequest.send();
    }
};

cardsRequest.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        updateCardsJsonFile();
    }
};

// First hit v1/latest to get most recent patch number.
latestRequest.open("GET", "https://api.hearthstonejson.com/v1/latest/", true);
latestRequest.send();
