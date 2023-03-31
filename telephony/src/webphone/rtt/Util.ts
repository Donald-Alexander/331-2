export function Util() {
    const unixToNtpOffset = 2208988800;

    return {
        newMID() : String {
            // Create new Message ID (used to identify an individual message, which may be chunked)
            // RFC 4975 suggests a complicated way of ensuring uniqueness, but we're
            // being lazy.
            var now : Date = new Date();
            return this.dateToNtpTime(now) + '.' + Math.random().toString(36).substr(2, 8);
        },
        ntpTimeToDate(ntpTime: string) : Date {
            return new Date((parseInt(ntpTime, 10) - unixToNtpOffset) * 1000);
        },
        dateToNtpTime(date: Date) : number {
            return parseInt((date.getTime() / 1000).toString(), 10) + unixToNtpOffset;
        },
        /**
         * Decodes an SDP filename-string, as defined in RFC 5547.
         * @param {String} str The string to decode.
         * @returns {String} The decoded string.
         */
        decodeSdpFileName(str: string) : string {
            return str.replace(/%00/g, '\0').replace(/%0A/gi, '\n').replace(/%0D/gi, '\r').replace(/%22/g, '"').replace(/%25/g, '%');
        },
        /**
         * Encodes a string as a quoted-string, as defined in RFC 822.
         * Note: does not support folding.
         * @param {String} str The string to encode.
         * @returns {String} The encoded string.
         */
        encodeQuotedString(str: string) : string {
            var chars = str.split(''),
                index;
            for (index in chars) {
                switch (chars[index]) {
                    case '"':
                    case '\r':
                    case '\\':
                        // These must be escaped as a quoted-pair
                        chars[index] = '\\' + chars[index];
                        break;
                }
            }
            return chars.join('');
        },
        /**
         * Decodes a quoted-string, as defined in RFC 822.
         * Note: does not support folding.
         * @param {String} str The string to decode.
         * @returns {String} The decoded string.
         */
        decodeQuotedString(str: string) : string {
            var chars = str.split(''),
                index, escaped = false;
            for (index in chars) {
                if (escaped) {
                    // Always include this char as-is
                    continue;
                }
                if (chars[index] === '\\') {
                    escaped = true;
                    delete chars[index];
                }
            }
            return chars.join('');
        },
        /**
         * Counts UTF-8 characters
         */
        byteLength(str: string) : number {
            // returns the byte length of an utf8 string
            var s = str.length;
            for (var i = str.length - 1; i >= 0; i--) {
                var code = str.charCodeAt(i);
                if (code > 0x7f && code <= 0x7ff) s++;
                else if (code > 0x7ff && code <= 0xffff) s += 2;
                if (code >= 0xDC00 && code <= 0xDFFF) i--; //trail surrogate
            }
            return s;
        },
    };
};
