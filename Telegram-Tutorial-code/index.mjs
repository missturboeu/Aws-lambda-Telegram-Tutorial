import https from 'https';

export const handler = async (event) => {
    try {
        // Parse the JSON string in the body
        const body = JSON.parse(event.body);

        const telegramBotToken = body.bot_token;
        const telegramChatId = body.chat_id;
        const messageTemplate = body.text;
        const apiUrl = body.api_url;
        const apiPayloadUrl = body.api_payload_url;

        // Function to safely replace placeholders
        const replacePlaceholders = (template, data) => {
            return template.replace(/{{(\w+)}}/g, (_, key) => {
                return data[key] !== undefined ? data[key] : `{{${key}}}`;
            });
        };

        // Replace placeholders in the message template
        const message = replacePlaceholders(messageTemplate, {
            exchange: event.exchange,
            ticker: event.ticker,
            close: event.close,
            time: event.time
        });

        const sendTelegramMessage = (token, chatId, text) => {
            const url = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}`;

            return new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        resolve(JSON.parse(data));
                    });
                }).on('error', (e) => {
                    reject(e);
                });
            });
        };

        const callAdditionalApi = (apiUrl, payload) => {
            const data = JSON.stringify(payload);

            const options = {
                hostname: new URL(apiUrl).hostname,
                path: new URL(apiUrl).pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            return new Promise((resolve, reject) => {
                const req = https.request(options, (res) => {
                    let responseBody = '';

                    res.on('data', (chunk) => {
                        responseBody += chunk;
                    });

                    res.on('end', () => {
                        resolve(responseBody);
                    });
                });

                req.on('error', (e) => {
                    reject(e);
                });

                req.write(data);
                req.end();
            });
        };

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timed out')), 50000)
        );

        // Combine the API call with the timeout
        const apiCall = callAdditionalApi(apiUrl, { url: apiPayloadUrl });

        const combinedPromise = Promise.race([apiCall, timeoutPromise]);

        try {
            const apiResponse = await combinedPromise;
            console.log('API response:', apiResponse);

            // Parse the API response
            let parsedApiResponse;
            if (typeof apiResponse === 'string') {
                parsedApiResponse = JSON.parse(apiResponse);
            } else {
                parsedApiResponse = apiResponse;
            }

            // Extract the value assigned to newTabUrl
            const newTabUrl = parsedApiResponse.newTabUrl;

            // Merge the initial message with the API response
            const combinedMessage = newTabUrl ? `${message}\n\n ${newTabUrl}` : message;

            // Send the combined message to Telegram
            const telegramResponse = await sendTelegramMessage(telegramBotToken, telegramChatId, combinedMessage);
            console.log('Message sent:', telegramResponse);

            return {
                statusCode: 200,
                body: JSON.stringify('Message sent successfully!')
            };
        } catch (error) {
            console.error('API call error or timeout:', error);

            // Send the initial message to Telegram
            const telegramResponse = await sendTelegramMessage(telegramBotToken, telegramChatId, message);
            console.log('Fallback message sent:', telegramResponse);

            return {
                statusCode: 200,
                body: JSON.stringify('Fallback message sent successfully!')
            };
        }
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify('Error sending message')
        };
    }
};
