// Turns the parsed query AST into a MongoDB filter.
//
// Only allowlisted fields can be queried. This blocks NoSQL injection
// (e.g. `$where:...`) and stops users from filtering on unindexed fields.

const { parse, QueryError } = require('./parser');

const FIELDS = {
    level: 'string',
    message: 'string',
    resourceId: 'string',
    timestamp: 'date',
    traceId: 'string',
    spanId: 'string',
    commit: 'string',
    'metadata.parentResourceId': 'string',
};

const MONGO_CMP = { '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte' };

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fieldType(field) {
    // hasOwn, not FIELDS[field]: inherited keys like `__proto__` must not pass.
    const type = Object.hasOwn(FIELDS, field) ? FIELDS[field] : undefined;
    if (!type) throw new QueryError(`Unknown field '${field}'. Allowed: ${Object.keys(FIELDS).join(', ')}`);
    return type;
}

function toDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new QueryError(`Invalid date '${value}'`);
    return d;
}

function compileNode(node) {
    switch (node.type) {
        case 'and':
            return { $and: node.children.map(compileNode) };
        case 'or':
            return { $or: node.children.map(compileNode) };
        case 'not':
            return { $nor: [compileNode(node.child)] };

        case 'match': {
            const type = fieldType(node.field);
            if (type === 'date') return { [node.field]: toDate(node.value) };

            // Unquoted trailing * means prefix search. An anchored prefix regex can still use the index.
            if (!node.quoted && node.value.endsWith('*')) {
                const prefix = node.value.slice(0, -1);
                if (!prefix || prefix.includes('*')) throw new QueryError('Only trailing wildcards are supported, e.g. traceId:abc*');
                return { [node.field]: { $regex: '^' + escapeRegex(prefix) } };
            }
            if (!node.quoted && node.value.includes('*')) {
                throw new QueryError('Only trailing wildcards are supported, e.g. traceId:abc*');
            }
            return { [node.field]: node.value };
        }

        case 'compare': {
            if (fieldType(node.field) !== 'date') throw new QueryError(`Comparisons are only supported on timestamp`);
            return { [node.field]: { [MONGO_CMP[node.op]]: toDate(node.value) } };
        }

        case 'range': {
            if (fieldType(node.field) !== 'date') throw new QueryError(`Ranges are only supported on timestamp`);
            return { [node.field]: { $gte: toDate(node.from), $lte: toDate(node.to) } };
        }

        case 'text':
            // MongoDB only allows $text at the top level, so free text is handled in compile().
            throw new QueryError('Free-text terms can only be combined with AND, e.g. "connection refused" AND level:error');

        default:
            throw new QueryError(`Unsupported query node '${node.type}'`);
    }
}

// Returns a MongoDB filter for a query string. Free-text terms at the top
// level are combined into one $text search over the `message` text index.
function compile(query) {
    const ast = parse(query || '');
    if (!ast) return {};

    const topLevel = ast.type === 'and' ? ast.children : [ast];
    const textTerms = topLevel.filter(n => n.type === 'text');
    const others = topLevel.filter(n => n.type !== 'text');

    const clauses = others.map(compileNode);
    if (textTerms.length) {
        const search = textTerms.map(t => (t.quoted ? `"${t.value}"` : t.value)).join(' ');
        clauses.push({ $text: { $search: search } });
    }

    return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

module.exports = { compile, FIELDS, QueryError };
