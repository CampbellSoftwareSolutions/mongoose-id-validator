var mongoose = require('mongoose');
var Schema = mongoose.Schema;
module.exports = exports = idvalidator;

function idvalidator(schema, options) {
    options = options || {};
    var message = options.message || "{PATH} references a non existing ID";
    var connection = options.connection || mongoose;
    validateSchema(schema, message, connection);
}

function validateSchema(schema, message, connection) {
    schema.eachPath(function (path, schemaType) {

        //Apply validation recursively to sub-schemas
        if (schemaType.schema) {
            return validateSchema(schemaType.schema, message, connection);
        }

        var validateFunction = null;
        var refModelName = null;
        var conditions = {};

        if (schemaType.options && schemaType.options.ref) {
            validateFunction = validateId;
            refModelName = schemaType.options.ref;
            if (schemaType.options.refConditions) {
                conditions = schemaType.options.refConditions;
            }
        } else if (schemaType.caster && schemaType.caster.instance && schemaType.caster.options && schemaType.caster.options.ref) {
            validateFunction = validateIdArray;
            refModelName = schemaType.caster.options.ref;
            if (schemaType.caster.options.refConditions) {
                conditions = schemaType.caster.options.refConditions;
            }
        }

        if (validateFunction) {
            schema.path(path).validate(function (value, respond) {
                validateFunction(this, connection, refModelName, value, conditions, respond);
            }, message);
        }

    });
}

function executeQuery(query, conditions, validateValue, respond) {
    for (var fieldName in conditions) {
        query.where(fieldName, conditions[fieldName]);
    }
    query.exec(function (err, count) {
        if (err) {
            return respond(err);
        }
        respond(count === validateValue);
    });
}

function validateId(doc, connection, refModelName, value, conditions, respond) {
    if (value == null) {
        return respond(true);
    }
    var refModel = connection.model(refModelName);
    var query = refModel.count({_id: value});
    executeQuery(query, conditions, 1, respond);
}

function validateIdArray(doc, connection, refModelName, values, conditions, respond) {
    if (values == null || values.length == 0) {
        return respond(true);
    }
    var refModel = connection.model(refModelName);
    var query = refModel.count().where('_id')['in'](values);
    executeQuery(query, conditions, values.length, respond);
}
