var mongoose = require('mongoose')
var traverse = require('traverse')
var clone = require('clone')

function IdValidator () {
    this.enabled = true
}

IdValidator.prototype.enable = function () {
    this.enabled = true
}

IdValidator.prototype.disable = function () {
    this.enabled = false
}

IdValidator.prototype.validate = function (schema, options) {
    var self = this
    options = options || {}
    var message = options.message || '{PATH} references a non existing ID'
    var connection = options.connection || mongoose
    var allowDuplicates = options.allowDuplicates || false

    var caller = (self instanceof IdValidator) ? self : IdValidator.prototype

    return caller.validateSchema(schema, message, connection, allowDuplicates)
}

IdValidator.prototype.validateSchema = function (
    schema, message, connection, allowDuplicates) {
    var self = this
    var caller = (self instanceof IdValidator) ? self : IdValidator.prototype
    schema.eachPath(function (path, schemaType) {
        // Apply validation recursively to sub-schemas (but not ourself if we
        // are referenced recursively)
        if (schemaType.schema && schemaType.schema !== schema) {
            return caller.validateSchema(schemaType.schema, message,
                connection)
        }

        var validateFunction = null
        var refModelName = null
        var refModelPath = null
        var conditions = {}

        if (schemaType.options && schemaType.options.ref) {
            refModelName = schemaType.options.ref
            if (schemaType.options.refConditions) {
                conditions = schemaType.options.refConditions
            }
        } else if (schemaType.options && schemaType.options.refPath) {
            refModelPath = schemaType.options.refPath
            if (schemaType.options.refConditions) {
                conditions = schemaType.options.refConditions
            }
        } else if (schemaType.caster && schemaType.caster.instance &&
            schemaType.caster.options && schemaType.caster.options.ref) {
            refModelName = schemaType.caster.options.ref
            if (schemaType.caster.options.refConditions) {
                conditions = schemaType.caster.options.refConditions
            }
        }

        var isArraySchemaType =
            (schemaType.caster && schemaType.caster.instance) ||
            (schemaType.instance === 'Array') ||
            (schemaType['$isMongooseArray'] === true)
        validateFunction = isArraySchemaType ? validateIdArray : validateId

        if (refModelName || refModelPath) {
            schema.path(path).validate({
                validator: function (value) {
                    var conditionsCopy = conditions
                    //A query may not implement an isModified function.
                    if (this && !!this.isModified && !this.isModified(path)) {
                        return true
                    }
                    if (!(self instanceof IdValidator) || self.enabled) {
                        if (Object.keys(conditionsCopy).length > 0) {
                            var instance = this

                            conditionsCopy = clone(conditions)
                            traverse(conditionsCopy).forEach(function (value) {
                                if (typeof value === 'function') {
                                    this.update(value.call(instance))
                                }
                            })
                        }
                        var localRefModelName = refModelName
                        if (refModelPath) {
                            localRefModelName = this[refModelPath]
                        }

                        return validateFunction(this, connection, localRefModelName,
                            value, conditionsCopy, allowDuplicates)
                    }
                    return true
                },
                message: message
            })
        }
    })
}

async function executeQuery (query, conditions, validateValue) {
    for (var fieldName in conditions) {
        query.where(fieldName, conditions[fieldName])
    }
    const count = await query.exec()
    return count === validateValue
}

function validateId (doc, connection, refModelName, value, conditions) {
    if (value == null) return true

    var refModel = connection.model(refModelName)
    var query = refModel.countDocuments({_id: value})
    var session = doc.$session && doc.$session()
    if (session) query.session(session)

    return executeQuery(query, conditions, 1)
}

function validateIdArray (doc, connection, refModelName, values, conditions, allowDuplicates) {
    if (values == null || values.length == 0) return true

    var checkValues = values
    if (allowDuplicates) {
        //Extract unique values only
        checkValues = values.filter(function (v, i) {
            return values.indexOf(v) === i
        })
    }

    var refModel = connection.model(refModelName)
    var query = refModel.countDocuments().where('_id')['in'](checkValues)
    var session = doc.$session && doc.$session()
    if (session) query.session(session)

    return executeQuery(query, conditions, checkValues.length)
}

module.exports = IdValidator.prototype.validate
module.exports.getConstructor = IdValidator
