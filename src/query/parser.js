// Lucene-style query parser.
//
// Grammar (recursive descent):
//   query   := or
//   or      := and ("OR" and)*
//   and     := not (["AND"] not)*          -- AND is implicit between terms
//   not     := "NOT" not | primary
//   primary := "(" or ")" | term
//   term    := FIELD ":" value             -- level:error, resourceId:"server 1", traceId:abc*
//            | FIELD ":" CMP value         -- timestamp:>=2023-09-15T00:00:00Z
//            | FIELD ":" "[" value "TO" value "]"
//            | value                       -- free text, searched in `message`

class QueryError extends Error {}

const MAX_QUERY_LENGTH = 1000;
const MAX_DEPTH = 20;
const SPECIAL = new Set(['(', ')', '[', ']', '"']);
const CMP_OPS = ['>=', '<=', '>', '<'];

function tokenize(input) {
    const tokens = [];
    let i = 0;

    while (i < input.length) {
        const ch = input[i];

        if (/\s/.test(ch)) { i++; continue; }

        if (ch === '(' || ch === ')' || ch === '[' || ch === ']') {
            tokens.push({ type: ch });
            i++;
            continue;
        }

        if (ch === '"') {
            const end = input.indexOf('"', i + 1);
            if (end === -1) throw new QueryError('Unterminated quoted string');
            tokens.push({ type: 'VALUE', value: input.slice(i + 1, end), quoted: true });
            i = end + 1;
            continue;
        }

        // A bare word runs until whitespace or a special character.
        let j = i;
        while (j < input.length && !/\s/.test(input[j]) && !SPECIAL.has(input[j])) j++;
        const word = input.slice(i, j);
        i = j;

        if (['AND', 'OR', 'NOT', 'TO'].includes(word)) {
            tokens.push({ type: word });
            continue;
        }

        // Split on the FIRST colon only, so values like timestamps can contain colons.
        // Inside a range ("[a TO b]") a word is always a value, never field:value.
        const prev = tokens[tokens.length - 1];
        const inRange = prev && (prev.type === '[' || prev.type === 'TO');
        const colon = word.indexOf(':');
        if (colon > 0 && !inRange) {
            tokens.push({ type: 'FIELD', value: word.slice(0, colon) });
            let rest = word.slice(colon + 1);
            const op = CMP_OPS.find(o => rest.startsWith(o));
            if (op) {
                tokens.push({ type: 'CMP', value: op });
                rest = rest.slice(op.length);
            }
            if (rest) tokens.push({ type: 'VALUE', value: rest, quoted: false });
            continue;
        }

        tokens.push({ type: 'VALUE', value: word, quoted: false });
    }

    return tokens;
}

function parse(input) {
    if (typeof input !== 'string') throw new QueryError('Query must be a string');
    if (input.length > MAX_QUERY_LENGTH) throw new QueryError(`Query longer than ${MAX_QUERY_LENGTH} characters`);

    const tokens = tokenize(input);
    if (tokens.length === 0) return null;

    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const expect = (type) => {
        const tok = next();
        if (!tok || tok.type !== type) throw new QueryError(`Expected '${type}'`);
        return tok;
    };

    function parseOr(depth) {
        if (depth > MAX_DEPTH) throw new QueryError('Query is nested too deeply');
        const children = [parseAnd(depth)];
        while (peek() && peek().type === 'OR') {
            next();
            children.push(parseAnd(depth));
        }
        return children.length === 1 ? children[0] : { type: 'or', children };
    }

    function parseAnd(depth) {
        const children = [parseNot(depth)];
        while (peek() && peek().type !== 'OR' && peek().type !== ')') {
            if (peek().type === 'AND') next();
            children.push(parseNot(depth));
        }
        return children.length === 1 ? children[0] : { type: 'and', children };
    }

    function parseNot(depth) {
        if (peek() && peek().type === 'NOT') {
            next();
            return { type: 'not', child: parseNot(depth + 1) };
        }
        return parsePrimary(depth);
    }

    function parsePrimary(depth) {
        const tok = next();
        if (!tok) throw new QueryError('Unexpected end of query');

        if (tok.type === '(') {
            const node = parseOr(depth + 1);
            expect(')');
            return node;
        }

        if (tok.type === 'VALUE') {
            return { type: 'text', value: tok.value, quoted: tok.quoted };
        }

        if (tok.type === 'FIELD') {
            const field = tok.value;

            if (peek() && peek().type === '[') {
                next();
                const from = expect('VALUE').value;
                expect('TO');
                const to = expect('VALUE').value;
                expect(']');
                return { type: 'range', field, from, to };
            }

            if (peek() && peek().type === 'CMP') {
                const op = next().value;
                return { type: 'compare', field, op, value: expect('VALUE').value };
            }

            const value = expect('VALUE');
            return { type: 'match', field, value: value.value, quoted: value.quoted };
        }

        throw new QueryError(`Unexpected '${tok.type}'`);
    }

    const ast = parseOr(0);
    if (pos < tokens.length) throw new QueryError(`Unexpected '${peek().type}'`);
    return ast;
}

module.exports = { parse, tokenize, QueryError };
