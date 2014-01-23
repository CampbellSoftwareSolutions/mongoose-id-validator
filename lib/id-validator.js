var Schema = require('mongoose').Schema;

module.exports = exports = idvalidator;

function idvalidator(schema, options) {
	var message = "{PATH} references a non existing ID";
	if (options && options.message) {
		message = options.message;
	}

	schema.eachPath(function(path, schemaType) {
		var validateFunction = null;
		var refModelName = null;
		
		if (schemaType.options && schemaType.options.ref) {
			validateFunction = validateId;
			refModelName = schemaType.options.ref;
		} else if (schemaType.caster && schemaType.caster.instance === 'ObjectID' && schemaType.caster.options && schemaType.caster.options.ref) {
			validateFunction = validateIdArray;
			refModelName = schemaType.caster.options.ref;
		}
		
		if (validateFunction) {
			schema.path(path).validate(function(value, respond) {
				validateFunction(this, refModelName, value, respond);
			}, message);			
		}
	});
}

function validateId(doc, refModelName, value, respond) {
	var refModel = doc.model(refModelName);
	refModel.count({_id : value}).exec(function(err, count) {
		if (err) {
			return respond(err);
		}
		respond(count === 1);
	});
}

function validateIdArray(doc, refModelName, values, respond) {
	if (values.length == 0) {
		return respond(true);
	}
	var refModel = doc.model(refModelName);
	refModel.count().where('_id')['in'](values).exec(function(err, count) {
		if (err) {
			return respond(err);
		}
		respond(count === values.length);
	});
}