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
	var ColourSchema = new Schema({
		name : String
	});
	var Colour = mongoose.model('Colour', ColourSchema);

	var colours = {};
	var saveColours = [];
	'red green black blue silver'.split(' ').forEach(function(c) {
		saveColours.push(function(cb) {
			var newColour = new Colour({
				name : c
			});
			colours[c] = newColour;
			newColour.save(cb);
		});
	});

	var CarSchema = new Schema({
		name : String,
		manufacturer : {
			type : Schema.Types.ObjectId,
			ref : 'Manufacturer'
		},
		colours : [
			{
				type : Schema.Types.ObjectId,
				ref : 'Colour'
			}
		]
	});
	CarSchema.plugin(validator, {
		message : '{PATH} ID is bad'
	});
	var Car = mongoose.model('Car', CarSchema);

	beforeEach(function(done) {
		async.parallel([
				Manufacturer.remove.bind(Manufacturer, {}),
				Colour.remove.bind(Colour, {}),
				Car.remove.bind(Car, {}),
		], function(err) {
			if (err) {
				return done(err);
			}
			colours = [];
			async.parallel(saveColours, done);
		});
	});

	it('Should allow null manufacturer/colour IDs as developer can use '
			+ 'mongoose required option to make these mandatory', function(done) {
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

	it('Should validate correctly IDs in an array of ID references', function(done) {
		var c = new Car({
			name : "Test Car",
			colours : [
					colours['red'],
					colours['blue'],
					colours['black']
			]
		});
		c.save(done);
	});

	it('Should fail ID validation in an array of ID references', function(done) {
		var c = new Car({
			name : "Test Car",
			colours : [
					colours['red'],
					'50136e40c78c4b9403000001',
					colours['black']
			]
		});
		c.save(function(err) {
			err.name.should.eql('ValidationError');
			err.errors.colours.message.should.eql('colours ID is bad');
			done();
		});
	});

	it('Array of ID values should pass validation if not modified since last save', function(done) {
		var c = new Car({
			name : "Test Car",
			colours : [
					colours['red'],
					colours['blue'],
					colours['black']
			]
		});
		async.series([
				c.save.bind(c),
				function(cb) {
					colours['blue'].remove(cb);
				},
				c.validate.bind(c)
		], done);
	});
});