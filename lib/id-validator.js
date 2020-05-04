var mongoose = require('mongoose')
var traverse = require('traverse')
var clone = require('clone')
var Schema = mongoose.Schema

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
        var optionsSource = null

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
                    return new Promise(function (resolve, reject) {
                        var conditionsCopy = conditions
                        //A query may not implement an isModified function.
                        if (this && !!this.isModified && !this.isModified(path)) {
                            resolve(true)
                            return
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
                                value, conditionsCopy, resolve, reject, allowDuplicates)
                        }
                        resolve(true)
                        return
                    }.bind(this));
                },
                message: message
            })
        }
    })
}

function executeQuery (query, conditions, validateValue, resolve, reject) {
    for (var fieldName in conditions) {
        query.where(fieldName, conditions[fieldName])
    }
    query.exec(function (err, count) {
        if (err) {
            reject(err)
            return
        }
        return count === validateValue ? resolve(true) : resolve(false)
    })
}

function validateId (
    doc, connection, refModelName, value, conditions, resolve, reject) {
    if (value == null) {
        resolve(true)
        return
    }
    var refModel = connection.model(refModelName)
    var query = refModel.countDocuments({_id: value})
    var session = doc.$session && doc.$session()
    if (session) {
        query.session(session)
    }
    executeQuery(query, conditions, 1, resolve, reject)
}

function validateIdArray (
    doc, connection, refModelName, values, conditions, resolve, reject,
    allowDuplicates) {
    if (values == null || values.length == 0) {
        resolve(true)
        return
    }

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
    if (session) {
        query.session(session)
    }

    executeQuery(query, conditions, checkValues.length, resolve, reject)
}

module.exports = IdValidator.prototype.validate
module.exports.getConstructor = IdValidator
