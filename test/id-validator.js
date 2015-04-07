var mongoose = require('mongoose');
var validator = require('../lib/id-validator');
var async = require('async');
var should = require('should');

var Schema = mongoose.Schema;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mongoose-id-validator');

describe('mongoose-id-validator Integration Tests', function () {

    var ManufacturerSchema = new Schema({
        name: String
    });
    var Manufacturer = mongoose.model('Manufacturer', ManufacturerSchema);
    var ColourSchema = new Schema({
        name: String
    });
    var Colour = mongoose.model('Colour', ColourSchema);

    var colours = {};
    var saveColours = [];
    'red green black blue silver'.split(' ').forEach(function (c) {
        saveColours.push(function (cb) {
            var newColour = new Colour({
                name: c
            });
            colours[c] = newColour;
            newColour.save(cb);
        });
    });

    var CarSchema = new Schema({
        name: String,
        manufacturer: {
            type: Schema.Types.ObjectId,
            ref: 'Manufacturer'
        },
        colours: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Colour'
            }
        ]
    });
    CarSchema.plugin(validator, {
        message: '{PATH} ID is bad'
    });
    var Car = mongoose.model('Car', CarSchema);

    beforeEach(function (done) {
        async.parallel([
            Manufacturer.remove.bind(Manufacturer, {}),
            Colour.remove.bind(Colour, {}),
            Car.remove.bind(Car, {})
        ], function (err) {
            if (err) {
                return done(err);
            }
            colours = [];
            async.parallel(saveColours, done);
        });
    });

    it('Should allow no manufacturer/colour IDs as developer can use '
    + 'mongoose required option to make these mandatory', function (done) {
        var c = new Car({
            name: "Test Car"
        });
        c.save(done);
    });

    it('Should pass validation with explicit null ID', function (done) {
        var c = new Car({
            name: "Test Car",
            manufacturer: null
        });
        c.validate(done);
    });

    it('Should pass validation with explicit undefined ID', function (done) {
        var c = new Car({
            name: "Test Car",
            manufacturer: undefined
        });
        c.validate(done);
    });

    it('Should pass validation with explicit null array', function (done) {
        var c = new Car({
            name: "Test Car",
            colours: null
        });
        c.save(done);
    });

    it('Should pass validation with explicit undefined array', function (done) {
        var c = new Car({
            name: "Test Car",
            colours: undefined
        });
        c.save(done);
    });

    it('Should pass validation with existing ID', function (done) {
        var m = new Manufacturer({
            name: "Car Maker"
        });
        var c = new Car({
            name: "Test Car",
            manufacturer: m
        });
        async.series([
            m.save.bind(m),
            c.save.bind(c)
        ], done);
    });

    it('Should fail validation with custom message on bad ID', function (done) {
        var c = new Car({
            name: "Test Car",
            manufacturer: "50136e40c78c4b9403000001"
        });
        c.validate(function (err) {
            err.name.should.eql('ValidationError');
            err.errors.manufacturer.message.should.eql('manufacturer ID is bad');
            done();
        });
    });

    it('Should fail validation if bad ID set after previously good ID value', function (done) {
        var savePassed = false;
        var m = new Manufacturer({
            name: "Car Maker"
        });
        var c = new Car({
            name: "Test Car",
            manufacturer: m
        });
        async.series([
            m.save.bind(m),
            c.save.bind(c),
            function (cb) {
                savePassed = true;
                c.manufacturer = "50136e40c78c4b9403000001";
                c.save(cb);
            }
        ], function (err) {
            should(savePassed).be.ok;
            err.name.should.eql('ValidationError');
            err.errors.manufacturer.message.should.eql('manufacturer ID is bad');
            done();
        });
    });

    it('Should pass validation if no ID value changed (even when manufacturer subsequently removed)', function (done) {
        var m = new Manufacturer({
            name: "Car Maker"
        });
        var c = new Car({
            name: "Test Car",
            manufacturer: m
        });
        async.series([
            m.save.bind(m),
            c.save.bind(c),
            Manufacturer.remove.bind(Manufacturer, {}),
            c.save.bind(c)
        ], done);
    });

    it('Should validate correctly IDs in an array of ID references', function (done) {
        var c = new Car({
            name: "Test Car",
            colours: [
                colours['red'],
                colours['blue'],
                colours['black']
            ]
        });
        c.save(done);
    });

    it('Should fail ID validation in an array of ID references', function (done) {
        var c = new Car({
            name: "Test Car",
            colours: [
                colours['red'],
                '50136e40c78c4b9403000001',
                colours['black']
            ]
        });
        c.save(function (err) {
            err.name.should.eql('ValidationError');
            err.errors.colours.message.should.eql('colours ID is bad');
            done();
        });
    });

    it('Array of ID values should pass validation if not modified since last save', function (done) {
        var c = new Car({
            name: "Test Car",
            colours: [
                colours['red'],
                colours['blue'],
                colours['black']
            ]
        });
        async.series([
            c.save.bind(c),
            function (cb) {
                colours['blue'].remove(cb);
            },
            c.validate.bind(c)
        ], done);
    });

    describe('refConditions tests', function () {
        var PersonSchema = new Schema({
            name: String,
            gender: {
                type: String,
                enum: ['m', 'f']
            }
        });
        var Person = mongoose.model('Person', PersonSchema);

        var InfoSchema = new Schema({
            bestMaleFriend: {
                type: Schema.Types.ObjectId,
                ref: 'Person',
                refConditions: {
                    gender: 'm'
                }
            },
            femaleFriends: [
                {
                    type: Schema.Types.ObjectId,
                    ref: 'Person',
                    refConditions: {
                        gender: 'f'
                    }
                }
            ]
        });
        InfoSchema.plugin(validator);
        var Info = mongoose.model('Info', InfoSchema);

        var jack = new Person({name: 'Jack', gender: 'm'});
        var jill = new Person({name: 'Jill', gender: 'f'});
        var ann = new Person({name: 'Ann', gender: 'f'});

        before(function (done) {
            async.series([
                Person.remove.bind(Person, {}),
                Info.remove.bind(Info, {}),
                jack.save.bind(jack),
                jill.save.bind(jill),
                ann.save.bind(ann)
            ], done);
        });

        it('Should validate with single ID value that matches condition', function (done) {
            var i = new Info({bestMaleFriend: jack});
            i.validate(done);
        });

        it('Should fail to validate single ID value that exists but does not match conditions', function (done) {
            var i = new Info({bestMaleFriend: jill});
            i.validate(function (err) {
                err.should.property('name', 'ValidationError');
                err.errors.should.property('bestMaleFriend');
                done();
            });
        });

        it('Should validate array of ID values that match conditions', function (done) {
            var i = new Info({femaleFriends: [ann, jill]});
            i.validate(done);
        });

        it('Should not validate array of ID values containing value that exists but does not match conditions', function (done) {
            var i = new Info({femaleFriends: [jill, jack]});
            i.validate(function (err) {
                err.should.property('name', 'ValidationError');
                err.errors.should.property('femaleFriends');
                done();
            });
        })

    });

    describe('Recursion Tests', function () {
        var contactSchema = new mongoose.Schema({});
        var listSchema = new mongoose.Schema({
            name: String,
            contacts: [{
                reason: String,
                contactId: {
                    type: Schema.Types.ObjectId,
                    ref: 'Contact'
                }
            }]
        });
        listSchema.plugin(validator);

        var Contact = mongoose.model('Contact', contactSchema);
        var List = mongoose.model('List', listSchema);

        it('Should allow empty array', function (done) {
            var obj = new List({name: 'Test', contacts: []});
            obj.validate(done);
        });

        it('Should fail on invalid ID inside sub-schema', function (done) {
            var obj = new List({
                name: 'Test', contacts: [
                    {reason: 'My friend', contactId: '50136e40c78c4b9403000001'}
                ]
            });
            obj.validate(function(err) {
                err.should.property('name', 'ValidationError');
                err.errors.should.property('contacts.0.contactId');
                done();
            });
        });

        it('Should pass on valid ID in sub-schema', function (done) {
            var c = new Contact({});
            async.series([
                function (cb) {
                    c.save(cb);
                },
                function (cb) {
                    var obj = new List({
                        name: 'Test', contacts: [
                            {reason: 'My friend', contactId: c}
                        ]
                    });
                    obj.validate(cb);
                }
            ], done);
        });
    });

});
