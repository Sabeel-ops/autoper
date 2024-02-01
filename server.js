require('dotenv').config();
const express = require('express');
const Dropbox = require('dropbox').Dropbox;
const fetch = require('node-fetch');
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');

const app = express();
const port = 3000;
app.use(express.static('public'));

const CLIENT_ID = 'a6564bce09d249f1a897dc7a8a50a087';
const CLIENT_SECRET = 'p8e-uPDbSta8K487sg3Oi9yOvQkaMk6zKYsG';
const DROPBOX_ACCESS_TOKEN = 'sl.Buy80O_8TEWikogWNfJh0YXC-Zs-t2rIERD1aqQ80TjxxJYZ4pinfYWpg5_pAkdHn0MVHIKBQvOXbyF1Q1JwTvGY0Q8aVd_5sVMKf1udrGlOrLaAAapmMOHv5mkw6NNtaYU4xam5Tf__NfozYYX2QHw';

const sourcePSDPath = '/source.psd';
const modifiedImagePath = '/source_modified.png';
const fontPath = '/josephsophia.ttf';
const content = 'Hehe';

const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });
// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
const TOKEN_PATH = 'token.json';
const SHEET_PATH = 'sheet.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Google Sheets API.
    authorize(JSON.parse(content), listMajors);
});

function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    fs.readFile(TOKEN_PATH, 'utf8', (err, token) => {
        if (err) {
            return getNewToken(oAuth2Client, callback);
        }
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}


function listMajors(auth, res) {
    const sheets = google.sheets({ version: 'v4', auth });
    sheets.spreadsheets.values.get({
        spreadsheetId: '18NlJR8P6it1K0z5YB-LuLUDZ5iM99DToCnf-ri_-93Y',
        range: 'Class Data!A2:E'
    }, async (err, sheetsRes) => {
        if (err) {
            console.log('The API returned an error: ' + err);
            if (res) {
                res.status(500).send('Internal Server Error');
            }
            return;
        }

        const rows = sheetsRes.data.values;
        if (rows.length) {
            const data = [];
            for (const row of rows) {
                const orderInfo = {
                    orderno: row[0],
                    sku: row[1],
                    sku2: row[2],
                    sku3: row[3],
                    date: row[4],
                    
                };
                
        

            
                let jobResult;
    try {
        let access_token = await getAccessToken(CLIENT_ID, CLIENT_SECRET);

        let linkRequest = await dbx.filesGetTemporaryLink({ path: sourcePSDPath });
        let inputURL = linkRequest.result.link;

        linkRequest = await dbx.filesGetTemporaryUploadLink({ commit_info: { path: modifiedImagePath, mode: 'overwrite' } });
        let outputURL = linkRequest.result.link;

        let linkRequest2 = await dbx.filesGetTemporaryLink({ path: fontPath });
        let fontURL = linkRequest2.result.link;

        let data = {
            "inputs": [{
                "storage": "dropbox",
                "href": inputURL
            }],
            "options": {
                "fonts": [
                    {
                        "storage": "dropbox",
                        "href": fontURL
                    }
                ],
                "layers": [
                    {
                        "name": "Hello",
                        "text": {
                            "orientation": "horizontal",
                            "contents": content
                        }
                    }
                ],
            },
            "outputs": [{
                "storage": "dropbox",
                "type": "image/vnd.adobe.photoshop",
                "href": outputURL
            }]
        };

        let resp = await fetch('https://image.adobe.io/pie/psdService/text', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'x-api-key': CLIENT_ID
            },
            body: JSON.stringify(data)
        });

        let result = await resp.json();

        let status = 'running';
        

        while (status === 'running' || status === 'pending' || status === 'starting') {
            console.log('delaying while checking');
            await delay(5000);

            let jobReq = await fetch(result['_links']['self']['href'], {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'x-api-key': CLIENT_ID
                }
            });

            jobResult = await jobReq.json();

            status = jobResult.outputs[0]['status'];
        }

        console.log('Final result', JSON.stringify(jobResult.outputs, null, '\t'));

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
    
    // Handle thumbnail request
    try {
        const thumbnailRequest = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
                'Dropbox-API-Arg': JSON.stringify({
                    "format": "png",
                    "mode": "strict",
                    "quality": "quality_80",
                    "resource": {
                        ".tag": "path",
                        "path": modifiedImagePath
                    },
                    "size": "w64h64"
                })
            }
        });

        // Check if the response status is OK (200)
        if (!thumbnailRequest.ok) {
            console.error(`Error getting thumbnail: ${thumbnailRequest.statusText}`);
            res.status(thumbnailRequest.status).send('Error getting thumbnail');
            return;
        }

        // Await the Buffer before conversion to base64
        const thumbnailBuffer = await thumbnailRequest.buffer();

        // Convert the Buffer to a base64-encoded string
        const thumbnailData = thumbnailBuffer.toString('base64');
        console.log('Base64 Data:', thumbnailData);
        orderInfo.thumbnailD = thumbnailData;

        // Send the base64-encoded thumbnail image to the client
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
                
                fs.writeFile(SHEET_PATH, JSON.stringify(data), (err) => {
                    if (err) return console.error(err);
                    console.log('Sheet elements stored', SHEET_PATH);
                });
                
                // Pass the 'res' object to functionToRun
          
            data.push(orderInfo);
            }
            
            if (res) {
                res.json(data);
            }
        } else {
            if (res) {
                res.status(404).send('No data found.');
            }
        }
         // Add a function to get thumbnail data
       
    });
}




app.get('/spreadsheet', (req, res) => {
    authorize(JSON.parse(fs.readFileSync('credentials.json')), (auth) => {
        listMajors(auth, res);
    });
});





app.listen(port, () => {
    console.log(`Server is listening at http://localhost:${port}`);
});


async function delay(x) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, x);
    });
}

async function getAccessToken(clientId, clientSecret) {
    const params = new URLSearchParams();
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'openid,AdobeID,read_organizations');

    let resp = await fetch(`https://ims-na1.adobelogin.com/ims/token/v2?client_id=${clientId}`, {
        method: 'POST',
        body: params
    });
    let data = await resp.json();
    return data.access_token;
}
