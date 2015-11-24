var mongoose = require('mongoose');
var Schema = mongoose.Schema;

function IdValidator(){
    this.enabled = true;
}

IdValidator.prototype.enable = function(){
    this.enabled = true;
}

IdValidator.prototype.disable = function(){
    this.enabled = false;
}

IdValidator.prototype.validate = function(schema, options){
    var self = this;
    options = options || {};
    var message = options.message || "{PATH} references a non existing ID";
    var connection = options.connection || mongoose;

    var caller = (self instanceof IdValidator) ? self : IdValidator.prototype;

    return caller.validateSchema(schema, message, connection);
}

IdValidator.prototype.validateSchema = function(schema, message, connection) {
    var self = this;
    var caller = (self instanceof IdValidator) ? self : IdValidator.prototype;
    schema.eachPath(function (path, schemaType) {

        //Apply validation recursively to sub-schemas
        if (schemaType.schema) {
            return caller.validateSchema(schemaType.schema, message, connection);
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
                if(!(self instanceof IdValidator) || self.enabled){
                    return validateFunction(this, connection, refModelName, value, conditions, respond);
                }
                return respond(true);
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

module.exports = IdValidator.prototype.validate;
module.exports.getConstructor = IdValidator;
