require("dotenv").config();
const TelegramBot = require('node-telegram-bot-api');
const download = require('download');
const fs = require('fs');
const path = require('path');
const getFileSize = require('getfilesize');
const format = require("string-template");
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(path.join(__dirname, 'ffmpeg', 'ffmpeg.exe'));
const bot = new TelegramBot(process.env.BOT_TOKEN, {polling: true});
const DOWNLOAD_DIR_PATH = path.join(__dirname, 'downloads');
const PARSE_MODE = {parse_mode: 'HTML'};

bot.on('message', (userMessageData) => {
    try {
        const chatId = userMessageData.chat.id;
        const message = userMessageData.text;

        if (message === '/start')
            bot.sendMessage(chatId, format(process.env.MESSAGE_HELLO), PARSE_MODE);
        else if (message.includes('http'))
            parseMessageAndSendVideo(chatId, message);

    } catch (ex) {
        console.error(ex)
    }
});

function parseMessageAndSendVideo(chatId, message) {
    const {caption, url, fileNameWithExt, fileExt} = parseUserMessage(message);

    const resultFileNameWithExt = `${caption}.${fileExt}`;
    const resultConvertFileNameWithExt = `${caption}.${process.env.CONVERSION_FILE_EXT}`;
    const downloadFilePath = path.join(DOWNLOAD_DIR_PATH, resultFileNameWithExt);

    bot.sendMessage(chatId, format(process.env.MESSAGE_START_DONWLOADING, {name: fileNameWithExt}), PARSE_MODE);

    download(url, DOWNLOAD_DIR_PATH, {filename: resultFileNameWithExt}).then(() => {
        const fileSizeHuman = getFileSize(downloadFilePath);
        bot.sendMessage(chatId, format(process.env.MESSAGE_FINISH_DOWNLOADING, {name: caption, size: fileSizeHuman}), PARSE_MODE);
        convertOrJustSendVideo(chatId, resultFileNameWithExt, resultConvertFileNameWithExt, caption);
    });
}

function parseUserMessage(message) {
    let split = message.split('http');
    const caption = split[0].trim();
    const url = 'http' + split[1].trim();

    split = url.split('/');
    const fileNameWithExt = split.pop();

    split = fileNameWithExt.split('.');
    const fileName = split[0];
    const fileExt = split.pop();

    return {
        caption: caption || fileName,
        url,
        fileNameWithExt,
        fileName,
        fileExt
    };
}

function convertOrJustSendVideo(chatId, resultFileNameWithExt, resultConvertFileNameAndExt, resultCaption) {
    const filePath = path.join(DOWNLOAD_DIR_PATH, resultFileNameWithExt);
    const fileExt = filePath.split('.').pop();
    const convertFilePath = path.join(DOWNLOAD_DIR_PATH, resultConvertFileNameAndExt);

    const isNeedConversion = process.env.DO_FILE_CONVERSION_FLAG && process.env.CONVERSION_FILE_EXT !== fileExt;
    if (isNeedConversion) {
        bot.sendMessage(chatId, format(process.env.MESSAGE_START_CONVERTION, {fromExt: fileExt, toExt: process.env.CONVERSION_FILE_EXT}), PARSE_MODE);
        ffmpeg(filePath)
            .output(convertFilePath)
            .on('end', () => {
                const fileSizeHuman = getFileSize(convertFilePath);
                bot.sendMessage(chatId, format(process.env.MESSAGE_START_UPLOADING, {size: fileSizeHuman}), PARSE_MODE);
                sendVideoToChat(chatId, convertFilePath, resultConvertFileNameAndExt, resultCaption);
            })
            .run();
    } else {
        const fileSizeHuman = getFileSize(filePath);
        bot.sendMessage(chatId, format(process.env.MESSAGE_START_UPLOADING, {size: fileSizeHuman}), PARSE_MODE);
        sendVideoToChat(chatId, filePath, resultConvertFileNameAndExt, resultCaption);
    }
}

function sendVideoToChat(chatId, filePath, filename, caption) {
    canSendFileAsVideo(filePath)
        ? bot.sendVideo(chatId, filePath, {caption}, {filename})
        : bot.sendDocument(chatId, filePath, {caption}, {filename});
}

function canSendFileAsVideo(filePath) {
    return getFileSizeMb(filePath) <= process.env.SEND_AS_VIDEO_SIZE_LIMIT_MB;
}

function getFileSizeMb(filePath) {
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats["size"];
    return fileSizeInBytes / 1000000.0
}
