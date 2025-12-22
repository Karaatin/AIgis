import { piiBaseMask } from './piiBaseMask.js';

export default class EmailMask extends piiBaseMask {

    constructor() {

        super("EMAIL");
        
    }

    find(text, mode = 'strict') {

        const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
        return text.matchAll(regex);

    }
    
}