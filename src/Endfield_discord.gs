/** Config Starts. **/

const profiles = [
    {
        cred: "UYLH9O3ELkRQp4ijneD9NuuPVpZagXgs",  // Replace with your Endfield cred cookie value ( get from cookie )
        skGameRole: "3_4771085260_2",  // Replace with your Endfield skGameRole cookie value ( get from cookie )
        platform: "3",
        vName: "1.0.0",
        accountName: "acc_name" // Replace with a name to identify this account( a simple identifier )
    }
    // Add more profiles if needed
];

const discord_notify = true;
const myDiscordID = "1309092124771352706";  // Replace with your Discord ID (optional, for pinging)
const discordWebhook = "https://discord.com/api/webhooks/1551179797281902653/krueiQKgDpw7iGvcVzR5qwaaxeinYd4UF-cg-ELXxr8BfHdOdAbaaJCKKJH4oMFZzPwk";  // Replace with your Discord webhook URL

/** Config ends. **/


const attendanceUrl = 'https://zonai.skport.com/web/v1/game/endfield/attendance';

async function main() {
    const results = await Promise.all(profiles.map(autoClaimFunction));

    if (discord_notify && discordWebhook) {
        postWebhook(results);
    }
}

function autoClaimFunction({ cred, skGameRole, platform, vName, accountName }) {
    console.log(`[${accountName}] Checking credentials and performing check-in...`);
    
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Attempt to refresh token used for signing. If refresh fails, token will be empty.
    let token = "";
    try {
        token = refreshToken(cred, platform, vName);
        console.log(`[${accountName}] Token refreshed successfully.`);
    } catch (e) {
        console.error(`[${accountName}] Token refresh failed: ${e.message}`);
        // proceed with empty token; API may reject if token required
    }

    const sign = generateSign('/web/v1/game/endfield/attendance', '', timestamp, token, platform, vName);

    const header = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Referer': 'https://game.skport.com/',
        'Content-Type': 'application/json',
        'sk-language': 'en',
        'sk-game-role': skGameRole,
        'cred': cred,
        'platform': platform,
        'vName': vName,
        'timestamp': timestamp,
        'sign': sign,
        'Origin': 'https://game.skport.com',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site'
    };

    const options = {
        method: 'POST',
        headers: header,
        muteHttpExceptions: true,
    };

    let result = {
        name: accountName,
        success: false,
        status: "",
        rewards: ""
    };

    try {
        const endfieldResponse = UrlFetchApp.fetch(attendanceUrl, options);
        const responseJson = JSON.parse(endfieldResponse.getContentText());
        
        console.log(`[${accountName}] API Response Code: ${responseJson.code}`);

        if (responseJson.code === 0) {
            result.success = true;
            result.status = "✅ Check-in Successful";
            
            if (responseJson.data && responseJson.data.awardIds) {
                const awards = responseJson.data.awardIds.map(award => {
                    const resource = responseJson.data.resourceInfoMap ? responseJson.data.resourceInfoMap[award.id] : null;
                    return resource ? `${resource.name} x${resource.count}` : (award.id || "Unknown Item");
                }).join('\n');
                result.rewards = awards;
            } else {
                result.rewards = "No detailed reward info.";
            }
        } else if (responseJson.code === 10001) {
            result.success = true;
            result.status = "👌 Already Checked In";
            result.rewards = "Nothing to claim";
        } else {
            result.success = false;
            result.status = `❌ Error (Code: ${responseJson.code})`;
            result.rewards = responseJson.message || "Unknown Error";
        }
    } catch (error) {
        result.success = false;
        result.status = "💥 Exception";
        result.rewards = error.message;
        console.error(`[${accountName}] Exception: ${error.message}`);
    }

    return result;
}

function postWebhook(results) {
    console.log('Posting to Discord webhook...');
    
    const allSuccess = results.every(r => r.success);
    const hasError = !allSuccess;
    const embedColor = allSuccess ? 5763719 : 15548997; // Green or Red
    
    const fields = results.map(r => {
        return {
            name: `👤 ${r.name}`,
            value: `**Status:** ${r.status}\n**Rewards:**\n${r.rewards ? r.rewards : 'None'}`,
            inline: true
        };
    });

    const payload = {
        username: "Perlica",
        avatar_url: "https://i.imgur.com/TguAOiA.png",
        embeds: [{
            title: "📡 Endfield Daily Check-in Report",
            color: embedColor,
            fields: fields,
            footer: {
                text: `Time: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (UTC+7)`,
                icon_url: "https://assets.skport.com/assets/favicon.ico"
            }
        }]
    };

    if (hasError && myDiscordID) {
        payload.content = `<@${myDiscordID}> Script encountered an error, please check logs!`;
    }

    const options = {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        UrlFetchApp.fetch(discordWebhook, options);
    } catch (e) {
        console.error("Failed to send Discord webhook: " + e.message);
    }
}

/** Helper: Refresh token used for signing **/
function refreshToken(cred, platform, vName) {
    const refreshUrl = 'https://zonai.skport.com/web/v1/auth/refresh';

    const header = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'cred': cred,
        'platform': platform,
        'vName': vName,
        'Origin': 'https://game.skport.com',
        'Referer': 'https://game.skport.com/'
    };

    const options = {
        method: 'GET',
        headers: header,
        muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(refreshUrl, options);
    const json = JSON.parse(response.getContentText());

    if (json.code === 0 && json.data && json.data.token) {
        return json.data.token;
    } else {
        throw new Error(`Refresh Failed (Code: ${json.code}, Msg: ${json.message})`);
    }
}

/** Signature generation (HMAC-SHA256 then MD5) **/
function generateSign(path, body, timestamp, token, platform, vName) {
    let str = path + body + timestamp;
    const headerJson = `{"platform":"${platform}","timestamp":"${timestamp}","dId":"","vName":"${vName}"}`;
    str += headerJson;

    const hmacBytes = Utilities.computeHmacSha256Signature(str, token || '');
    const hmacHex = bytesToHex(hmacBytes);

    const md5Bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, hmacHex);
    return bytesToHex(md5Bytes);
}

function bytesToHex(bytes) {
    return bytes.map(function(byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
}
