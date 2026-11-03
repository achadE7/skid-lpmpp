const { google } = require('googleapis');
const fs = require('fs');

const getDriveAuth = () => {
    // Kode ini membuktikan kita menggunakan OAuth2, BUKAN Service Account
    const oauth2Client = new google.auth.OAuth2(
        process.env.GDRIVE_CLIENT_ID,
        process.env.GDRIVE_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GDRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2Client });
};

async function getOrCreateFolderHierarchy(folderNames) {
    const drive = getDriveAuth();
    let currentParentId = process.env.GDRIVE_ROOT_FOLDER_ID; 

    for (const folderName of folderNames) {
        const query = `name = '${folderName}' and '${currentParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const response = await drive.files.list({ q: query, fields: 'files(id, name)', spaces: 'drive' });

        if (response.data.files.length > 0) {
            currentParentId = response.data.files[0].id; 
        } else {
            const folder = await drive.files.create({
                resource: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [currentParentId] },
                fields: 'id'
            });
            currentParentId = folder.data.id;
        }
    }
    return currentParentId; 
}

async function uploadToGoogleDrive({ filePath, fileName, folderHierarchy }) {
    const drive = getDriveAuth();
    try {
        const folderId = await getOrCreateFolderHierarchy(folderHierarchy);
        
        const response = await drive.files.create({
            resource: { name: fileName, parents: [folderId] },
            media: { mimeType: 'application/pdf', body: fs.createReadStream(filePath) },
            fields: 'id, webViewLink'
        });

        fs.unlinkSync(filePath);
        return { fileId: response.data.id, webViewLink: response.data.webViewLink };
    } catch (error) {
        console.error('[Google Drive] Gagal mengunggah:', error);
        throw error;
    }
}

module.exports = { uploadToGoogleDrive };