import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ResponseHandler } from '../../src/modules/responseHandler.js';
import { ToonConverter } from '../../src/modules/toonConverter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgeSource = readFileSync(join(__dirname, '../../public/clipboard-bridge.js'), 'utf-8');

class FakeClipboardItem {
    constructor(data) {
        this.data = data;
    }

    get types() {
        return Object.keys(this.data);
    }

    async getType(type) {
        return new Blob([this.data[type]], { type });
    }
}

// page world with the bridge, sharing its document with the content script
function setup({ userGesture = true } = {}) {
    const page = new EventTarget();

    class FakeClipboard { }
    const site = { writeText: vi.fn(async () => { }), write: vi.fn(async () => { }) };
    FakeClipboard.prototype.writeText = site.writeText;
    FakeClipboard.prototype.write = site.write;
    new Function('Clipboard', 'ClipboardItem', 'document', bridgeSource)(FakeClipboard, FakeClipboardItem, page);

    const extension = { writeText: vi.fn(async () => { }), write: vi.fn(async () => { }) };
    vi.stubGlobal('document', page);
    vi.stubGlobal('navigator', { userActivation: { isActive: userGesture }, clipboard: extension });
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    page.addEventListener('aigis:clipboard', (e) => ResponseHandler.handleClipboardRelay(e));

    // everything the page gets to see
    const pageEvents = [];
    page.addEventListener('aigis:clipboard', (e) => pageEvents.push(e.detail));
    page.addEventListener('aigis:clipboard-done', (e) => pageEvents.push(e.detail));

    return { page, clipboard: new FakeClipboard(), site, extension, pageEvents };
}

describe('Clipboard bridge (copy buttons of the sites)', () => {

    beforeEach(() => {
        ResponseHandler.vaultCache = {
            '[EMAIL_1]': { val: 'john.doe@acme.io', expiresAt: Date.now() + 60000 },
            '[CUSTOM_1]': { val: 'Project Falcon', expiresAt: Date.now() + 60000 },
            '[FILE_PATH_1]': 'C:\\Users\\john\\report.docx'
        };
        vi.spyOn(ResponseHandler, 'showToast').mockImplementation(() => { });
        vi.spyOn(ResponseHandler, 'hasBadge').mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        ResponseHandler.vaultCache = {};
    });

    it('should pass copies without placeholders straight to the site', async () => {
        const { clipboard, site, extension, pageEvents } = setup();

        await clipboard.writeText('Nothing to unmask here.');

        expect(site.writeText).toHaveBeenCalledWith('Nothing to unmask here.');
        expect(extension.writeText).not.toHaveBeenCalled();
        expect(pageEvents).toHaveLength(0);
    });

    it('should write the unmasked text itself and never hand it back to the page', async () => {
        const { clipboard, site, extension, pageEvents } = setup();

        await clipboard.writeText('Mail [EMAIL_1] about [EMAIL_9].');

        expect(extension.writeText).toHaveBeenCalledWith('Mail john.doe@acme.io about [EMAIL_9].');
        expect(site.writeText).not.toHaveBeenCalled();
        expect(pageEvents).toHaveLength(2);
        expect(pageEvents.join('\n')).not.toContain('john.doe@acme.io');
    });

    it('should let the site copy as usual without a user gesture', async () => {
        const { clipboard, site, extension } = setup({ userGesture: false });

        await clipboard.writeText('Mail [EMAIL_1]');

        expect(site.writeText).toHaveBeenCalledWith('Mail [EMAIL_1]');
        expect(extension.writeText).not.toHaveBeenCalled();
    });

    it('should fall back to the copy of the site if writing fails', async () => {
        const { clipboard, site, extension } = setup();
        extension.writeText.mockRejectedValue(new Error('Document is not focused.'));

        await clipboard.writeText('Mail [EMAIL_1]');

        expect(extension.writeText).toHaveBeenCalledTimes(1);
        expect(site.writeText).toHaveBeenCalledWith('Mail [EMAIL_1]');
    });

    it('should unmask text items and pass other formats through', async () => {
        const { clipboard, site, extension } = setup();

        await clipboard.write([new FakeClipboardItem({ 'text/plain': 'Mail [EMAIL_1]' })]);
        expect(extension.writeText).toHaveBeenCalledWith('Mail john.doe@acme.io');
        expect(site.write).not.toHaveBeenCalled();

        const withImage = [new FakeClipboardItem({ 'image/png': 'png', 'text/plain': 'Mail [EMAIL_1]' })];
        await clipboard.write(withImage);
        expect(site.write).toHaveBeenCalledWith(withImage);
        expect(extension.write).not.toHaveBeenCalled();
    });

    it('should write HTML items together with the unmasked text', async () => {
        const { clipboard, extension } = setup();
        
        vi.spyOn(ResponseHandler, 'unmaskHtml').mockImplementation(html => html.replace('[EMAIL_1]', 'john.doe@acme.io'));

        await clipboard.write([new FakeClipboardItem({ 'text/plain': 'Mail [EMAIL_1]', 'text/html': '<p>Mail [EMAIL_1]</p>' })]);

        const [[items]] = extension.write.mock.calls;
        expect(await (await items[0].getType('text/plain')).text()).toBe('Mail john.doe@acme.io');
        expect(await (await items[0].getType('text/html')).text()).toBe('<p>Mail john.doe@acme.io</p>');
    });

    it('should ignore malformed requests', () => {
        const { page } = setup();

        const taken = !page.dispatchEvent(new CustomEvent('aigis:clipboard', { cancelable: true, detail: '{nope' }));

        expect(taken).toBe(false);
    });

    it('should replace known placeholders, and bare labels only where a badge shows them', () => {
        vi.spyOn(ResponseHandler, 'hasBadge').mockImplementation(placeholder => placeholder === '[CUSTOM_1]');

        const text = '[EMAIL_1] on CUSTOM_1, not EMAIL_1, [EMAIL_9], MY_CUSTOM_1 or CUSTOM_10';

        expect(ResponseHandler.unmaskText(text))
            .toBe('john.doe@acme.io on Project Falcon, not EMAIL_1, [EMAIL_9], MY_CUSTOM_1 or CUSTOM_10');
    });

    it('should restore TOON blocks with the originals as valid JSON values', () => {
        const prompt = ToonConverter.convert('Files: [{"id":1,"path":"[FILE_PATH_1]"},{"id":2,"path":"[FILE_PATH_1]"}]');

        const copied = ResponseHandler.unmaskPlain(prompt);

        expect(copied).not.toContain('AIgis:TOON');
        const json = JSON.parse(copied.slice(copied.indexOf('['), copied.lastIndexOf(']') + 1));
        expect(json).toEqual([
            { id: 1, path: 'C:\\Users\\john\\report.docx' },
            { id: 2, path: 'C:\\Users\\john\\report.docx' }
        ]);
    });

    it('should unmask clipboard data set by copy handlers of the site, but not by editors', () => {
        const data = { 'text/plain': 'Mail [EMAIL_1]' };
        const clipboardData = { getData: (type) => data[type] ?? '', setData: (type, value) => { data[type] = value; } };

        ResponseHandler.unmaskCopyData({ defaultPrevented: false, clipboardData });
        ResponseHandler.unmaskCopyData({ defaultPrevented: true, clipboardData, target: { isContentEditable: true } });
        expect(data['text/plain']).toBe('Mail [EMAIL_1]');

        ResponseHandler.unmaskCopyData({ defaultPrevented: true, clipboardData, target: { isContentEditable: false } });
        expect(data['text/plain']).toBe('Mail john.doe@acme.io');
    });

});
