var Schema = require('mongoose').Schema;

module.exports = exports = idvalidator;

function idvalidator(schema, options) {
	var message = "{PATH} references a non existing ID";
	if (options && options.message) {
		message = options.message;
	}

	schema.eachPath(function(path, schemaType) {
		if (schemaType.options && schemaType.options.ref) {
			schema.path(path).validate(function(value, respond) {
				validateId(this, schemaType.options.ref, value, respond);
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