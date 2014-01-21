var mongoose = require('mongoose');
var validator = require('../lib/id-validator');
var async = require('async');
var should = require('should');

var Schema = mongoose.Schema;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mongoose-id-validator');

describe('mongoose-id-validator Integration Tests', function() {

	var ManufacturerSchema = new Schema({
		name : String
	});
	var Manufacturer = mongoose.model('Manufacturer', ManufacturerSchema);

	var CarSchema = new Schema({
		name : String,
		manufacturer : {
			type : Schema.Types.ObjectId,
			ref : 'Manufacturer'
		}
	});
	CarSchema.plugin(validator, {
		message : '{PATH} ID is bad'
	});
	var Car = mongoose.model('Car', CarSchema);

	beforeEach(function(done) {
		async.parallel([
				Manufacturer.remove.bind(Manufacturer, {}),
				Car.remove.bind(Car, {})
		], done);
	});

	it('Should allow null manufacturer ID as developer can use mongoose required option to make these mandatory',
			function(done) {
				var c = new Car({
					name : "Test Car"
				});
				c.save(done);
			});

	it('Should fail validation with custom message on bad ID', function(done) {
		var c = new Car({
			name : "Test Car",
			manufacturer : "50136e40c78c4b9403000001"
		});
		c.validate(function(err) {
			err.name.should.eql('ValidationError');
			err.errors.manufacturer.message.should.eql('manufacturer ID is bad');
			done();
		});
	});

	it('Should pass validation with existing ID', function(done) {
		var m = new Manufacturer({
			name : "Car Maker"
		});
		var c = new Car({
			name : "Test Car",
			manufacturer : m
		});
		async.series([
				m.save.bind(m),
				c.save.bind(c)
		], done);
	});

	it('Should fail validation if bad ID set after previously good ID value', function(done) {
		var savePassed = false;
		var m = new Manufacturer({
			name : "Car Maker"
		});
		var c = new Car({
			name : "Test Car",
			manufacturer : m
		});
		async.series([
				m.save.bind(m),
				c.save.bind(c),
				function(cb) {
					savePassed = true;
					c.manufacturer = "50136e40c78c4b9403000001";
					c.save(cb);
				}
		], function(err) {
			should(savePassed).be.ok;
			err.name.should.eql('ValidationError');
			err.errors.manufacturer.message.should.eql('manufacturer ID is bad');
			done();
		});
	});

	it('Should pass validation if no ID value changed (even when manufacturer subsequently removed)', function(done) {
		var m = new Manufacturer({
			name : "Car Maker"
		});
		var c = new Car({
			name : "Test Car",
			manufacturer : m
		});
		async.series([
				m.save.bind(m),
				c.save.bind(c),
				Manufacturer.remove.bind(Manufacturer, {}),
				c.save.bind(c)
		], done);
	});
});