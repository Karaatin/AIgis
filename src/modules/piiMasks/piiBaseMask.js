/**
 * BaseMask Strategy for PII Detection
 */
export class piiBaseMask {

    /**
     * @param {string} type - The type of the mask (e.g., "EMAIL", "IBAN")
     * @param {string} [prefix] - Optional prefix for placeholder (defaults to type)
     */
    constructor(type, prefix = null) {

        this.type = type;
        this.prefix = (prefix || type).toUpperCase();

    }

    /**
     * Finds PII matches in the given text.
     * Must be overwritten by subclasses.
     * @param {string} text - The text to scan
     * @param {string} mode - 'strict' or 'developer'. Can be used to relax rules.
     * @returns {IterableIterator<RegExpMatchArray>} Iterator of matches
     */
    find(text, mode = 'strict') {

        throw new Error(`find() must be implemented in ${this.constructor.name}`);

    }

    /**
     * Optional: Validates a found match.
     * Can depend on the mode (e.g. ignore local IPs in dev mode).
     * @param {string} matchText
     * @param {string} mode - 'strict' or 'developer'
     * @returns {boolean} True if valid (should be masked)
     */
    validate(matchText, mode = 'strict') {

        return true; 
        
    }

}