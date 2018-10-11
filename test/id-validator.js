var mongoose = require('mongoose')
var validator = require('../lib/id-validator')
var async = require('async')
var should = require('should')
var IdValidator = require('../lib/id-validator').getConstructor

var Schema = mongoose.Schema

var url = 'mongodb://localhost:27017/mongoose-id-validator'
if (process.env.MONGO_PORT_27017_TCP_PORT) {
    url = 'mongodb://' + process.env.MONGO_PORT_27017_TCP_ADDR + ':' +
        process.env.MONGO_PORT_27017_TCP_PORT + '/mongoose-id-validator'
}
var connection2

function validatorConcept(schema) {

    var idvalidator = new IdValidator()
    schema.plugin(IdValidator.prototype.validate.bind(idvalidator))

    schema.statics.enableValidation = function () {
        idvalidator.enable()
    }

    schema.statics.disableValidation = function () {
        idvalidator.disable()
    }
}

before(function (done) {
    mongoose.connect(url, { useNewUrlParser: true }, done)
    connection2 = mongoose.createConnection(url + '2', { useNewUrlParser: true })
})

describe('mongoose-id-validator Integration Tests', function () {

    var ManufacturerSchema = new Schema({
        name: String
    })
    var Manufacturer = mongoose.model('Manufacturer', ManufacturerSchema)
    var ColourSchema = new Schema({
        name: String
    })
    var Colour = mongoose.model('Colour', ColourSchema)

    var colours = {}
    var saveColours = []
    'red green black blue silver'.split(' ').forEach(function (c) {
        saveColours.push(function (cb) {
            var newColour = new Colour({
                name: c
            })
            colours[c] = newColour
            newColour.save(cb)
        })
    })

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
    })
    CarSchema.plugin(validator, {
        message: '{PATH} ID is bad'
    })
    var Car = mongoose.model('Car', CarSchema)

    var BikeSchema = new Schema({
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
    })

    validatorConcept(BikeSchema)

    var Bike = mongoose.model('Bike', BikeSchema)

    beforeEach(function (done) {
        async.parallel([
            Manufacturer.deleteMany.bind(Manufacturer, {}),
            Colour.deleteMany.bind(Colour, {}),
            Car.deleteMany.bind(Car, {}),
            Bike.deleteMany.bind(Bike, {})
        ], function (err) {
            if (err) {
                return done(err)
            }
            colours = []
            async.parallel(saveColours, done)
        })
    })

    it('Should allow no manufacturer/colour IDs as developer can use '
        + 'mongoose required option to make these mandatory', function (done) {
            var c = new Car({
                name: 'Test Car'
            })
            c.save(done)
        })

    it('Should pass validation with explicit null ID', function (done) {
        var c = new Car({
            name: 'Test Car',
            manufacturer: null
        })
        c.validate(done)
    })

    it('Should pass validation with explicit undefined ID', function (done) {
        var c = new Car({
            name: 'Test Car',
            manufacturer: undefined
        })
        c.validate(done)
    })

    it('Should pass validation with explicit null array', function (done) {
        var c = new Car({
            name: 'Test Car',
            colours: null
        })
        c.save(done)
    })

    it('Should pass validation with explicit undefined array', function (done) {
        var c = new Car({
            name: 'Test Car',
            colours: undefined
        })
        c.save(done)
    })

    it('Should pass validation with existing ID', function (done) {
        var m = new Manufacturer({
            name: 'Car Maker'
        })
        var c = new Car({
            name: 'Test Car',
            manufacturer: m
        })
        async.series([
            m.save.bind(m),
            c.save.bind(c)
        ], done)
    })

    it('Should fail validation with custom message on bad ID', function (done) {
        var c = new Car({
            name: 'Test Car',
            manufacturer: '50136e40c78c4b9403000001'
        })
        c.validate(function (err) {
            err.name.should.eql('ValidationError')
            err.errors.manufacturer.message.should.eql('manufacturer ID is bad')
            done()
        })
    })

    it('Should fail validation on bad ID with IdValidator instance',
        function (done) {
            var b = new Bike({
                name: 'Test Bike',
                manufacturer: '50136e40c78c4b9403000001'
            })
            b.validate(function (err) {
                err.name.should.eql('ValidationError')
                err.errors.manufacturer.message.should.eql(
                    'manufacturer references a non existing ID')
                done()
            })
        })

    it('Should ignore validation when it is disabled', function (done) {
        Bike.disableValidation()
        var b = new Bike({
            name: 'Test Bike',
            manufacturer: '50136e40c78c4b9403000001'
        })
        b.save(done)
    })

    it('Should fail validation if bad ID set after previously good ID value',
        function (done) {
            var savePassed = false
            var m = new Manufacturer({
                name: 'Car Maker'
            })
            var c = new Car({
                name: 'Test Car',
                manufacturer: m
            })
            async.series([
                m.save.bind(m),
                c.save.bind(c),
                function (cb) {
                    savePassed = true
                    c.manufacturer = '50136e40c78c4b9403000001'
                    c.save(cb)
                }
            ], function (err) {
                should(savePassed).be.ok
                err.name.should.eql('ValidationError')
                err.errors.manufacturer.message.should.eql(
                    'manufacturer ID is bad')
                done()
            })
        })

    it(
        'Should pass validation if no ID value changed (even when manufacturer subsequently removed)',
        function (done) {
            var m = new Manufacturer({
                name: 'Car Maker'
            })
            var c = new Car({
                name: 'Test Car',
                manufacturer: m
            })
            async.series([
                m.save.bind(m),
                c.save.bind(c),
                Manufacturer.deleteMany.bind(Manufacturer, {}),
                c.save.bind(c)
            ], done)
        })

    it('Should validate correctly IDs in an array of ID references',
        function (done) {
            var c = new Car({
                name: 'Test Car',
                colours: [
                    colours['red'],
                    colours['blue'],
                    colours['black']
                ]
            })
            c.save(done)
        })

    it('Should fail ID validation in an array of ID references',
        function (done) {
            var c = new Car({
                name: 'Test Car',
                colours: [
                    colours['red'],
                    '50136e40c78c4b9403000001',
                    colours['black']
                ]
            })
            c.save(function (err) {
                err.name.should.eql('ValidationError')
                err.errors.colours.message.should.eql('colours ID is bad')
                done()
            })
        })

    it(
        'Array of ID values should pass validation if not modified since last save',
        function (done) {
            var c = new Car({
                type: Schema.Types.ObjectId,
                colours: [
                    colours['red'],
                    colours['blue'],
                    colours['black']
                ]
            })
            async.series([
                c.save.bind(c),
                function (cb) {
                    colours['blue'].remove(cb)
                },
                c.validate.bind(c)
            ], done)
        })

    it('Should not trigger ref validation if path not modified',
        function (done) {
            var m = new Manufacturer({})
            var c = new Car({
                manufacturer: m._id,
                name: 'c'
            })
            var called = 0
            var tmp = Manufacturer.countDocuments
            Manufacturer.countDocuments = function () {
                called++
                return tmp.apply(this, arguments)
            }
            async.waterfall([
                function (cb) {
                    m.save(cb)
                },
                function (_, cb) {
                    c.save(cb)
                },
                function (_, cb) {
                    Car.findById(c._id, cb)
                },
                function (c, cb) {
                    c.name = 'd'
                    c.validate(cb)//must not trigger a count as manufacturerId not modified
                },
                function (cb) {
                    should(called).be.equal(1)
                    cb(null)
                }
            ], function (err) {
                Manufacturer.countDocuments = tmp
                done(err)
            })
        })

    describe('refConditions tests', function () {
        var PersonSchema = new Schema({
            name: String,
            gender: {
                type: String,
                enum: ['m', 'f']
            }
        })
        var Person = mongoose.model('Person', PersonSchema)

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
        })
        InfoSchema.plugin(validator)
        var Info = mongoose.model('Info', InfoSchema)

        var jack = new Person({ name: 'Jack', gender: 'm' })
        var jill = new Person({ name: 'Jill', gender: 'f' })
        var ann = new Person({ name: 'Ann', gender: 'f' })

        before(function (done) {
            async.series([
                Person.deleteMany.bind(Person, {}),
                Info.deleteMany.bind(Info, {}),
                jack.save.bind(jack),
                jill.save.bind(jill),
                ann.save.bind(ann)
            ], done)
        })

        it('Should validate with single ID value that matches condition',
            function (done) {
                var i = new Info({ bestMaleFriend: jack })
                i.validate(done)
            })

        it(
            'Should fail to validate single ID value that exists but does not match conditions',
            function (done) {
                var i = new Info({ bestMaleFriend: jill })
                i.validate(function (err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('bestMaleFriend')
                    done()
                })
            })

        it('Should validate array of ID values that match conditions',
            function (done) {
                var i = new Info({ femaleFriends: [ann, jill] })
                i.validate(done)
            })

        it(
            'Should not validate array of ID values containing value that exists but does not match conditions',
            function (done) {
                var i = new Info({ femaleFriends: [jill, jack] })
                i.validate(function (err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('femaleFriends')
                    done()
                })
            })
    })

    describe('refConditions with function tests', function () {
        var PeopleSchema = new Schema({
            name: String,
            gender: {
                type: String,
                enum: ['m', 'f']
            }
        })
        var People = mongoose.model('People', PeopleSchema)

        var FriendSchema = new Schema({
            mustBeFemale: Boolean,
            bestFriend: {
                type: Schema.Types.ObjectId,
                ref: 'People',
                refConditions: {
                    gender: function () {
                        return this.mustBeFemale ? 'f' : 'm'
                    }
                }
            },
            friends: [
                {
                    type: Schema.Types.ObjectId,
                    ref: 'People',
                    refConditions: {
                        gender: function () {
                            return this.mustBeFemale ? 'f' : 'm'
                        }
                    }
                }
            ]
        })
        FriendSchema.plugin(validator)

        var Friends = mongoose.model('Friends', FriendSchema)

        var jack = new People({ name: 'Jack', gender: 'm' })
        var jill = new People({ name: 'Jill', gender: 'f' })
        var ann = new People({ name: 'Ann', gender: 'f' })

        before(function (done) {
            async.series([
                People.deleteMany.bind(People, {}),
                Friends.deleteMany.bind(Friends, {}),
                jack.save.bind(jack),
                jill.save.bind(jill),
                ann.save.bind(ann)
            ], done)
        })

        it('Should validate with single ID value that matches condition',
            function (done) {
                var i = new Friends({ mustBeFemale: false, bestFriend: jack })
                i.validate(done)
            })

        it(
            'Should fail to validate single ID value that exists but does not match conditions',
            function (done) {
                var i = new Friends({ mustBeFemale: true, bestFriend: jack })
                i.validate(function (err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('bestFriend')
                    done()
                })
            })

        it('Should validate array of ID values that match conditions',
            function (done) {
                var i = new Friends({ mustBeFemale: true, friends: [ann, jill] })
                i.validate(done)
            })

        it(
            'Should not validate array of ID values containing value that exists but does not match conditions',
            function (done) {
                var i = new Friends({
                    mustBeFemale: true,
                    friends: [jill, jack]
                })

                i.validate(function (err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('friends')

                    done()
                })
            })
    })

    describe('Array Duplicate Tests', function () {

        var InventoryItemSchema = new Schema({
            name: String
        })

        function createInventorySchema(options) {
            var s = new Schema({
                items: [
                    {
                        type: Schema.Types.ObjectId,
                        ref: 'InventoryItem'
                    }
                ]
            })
            s.plugin(validator, options)
            return s
        }

        var InventoryNoDuplicatesSchema = createInventorySchema()
        var InventoryDuplicatesSchema = createInventorySchema({
            allowDuplicates: true
        })

        var InventoryItem = mongoose.model('InventoryItem', InventoryItemSchema)
        var InventoryNoDuplicates = mongoose.model('InventoryNoDuplicates',
            InventoryNoDuplicatesSchema)
        var InventoryDuplicates = mongoose.model('InventoryDuplicatesSchema',
            InventoryDuplicatesSchema)

        var item1 = new InventoryItem({ name: 'Widgets' })

        before(function (done) {
            async.series([
                item1.save.bind(item1)
            ], done)
        })

        it('Should fail to validate duplicate entries with default option',
            function (done) {
                var i = new InventoryNoDuplicates({ items: [item1, item1] })
                i.validate(function (err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('items')
                    done()
                })
            })

        it('Should pass validation of duplicate entries when allowDuplicates set',
            function (done) {
                var i = new InventoryDuplicates({ items: [item1, item1] })
                i.validate(done)
            })

    })

    describe('Recursion Tests', function () {
        var contactSchema = new mongoose.Schema({})
        var listSchema = new mongoose.Schema({
            name: String,
            contacts: [
                {
                    reason: String,
                    contactId: {
                        type: Schema.Types.ObjectId,
                        ref: 'Contact'
                    }
                }]
        })
        listSchema.plugin(validator)

        var Contact = mongoose.model('Contact', contactSchema)
        var List = mongoose.model('List', listSchema)

        it('Should allow empty array', function (done) {
            var obj = new List({ name: 'Test', contacts: [] })
            obj.validate(done)
        })

        it('Should fail on invalid ID inside sub-schema', function (done) {
            var obj = new List({
                name: 'Test', contacts: [
                    { reason: 'My friend', contactId: '50136e40c78c4b9403000001' }
                ]
            })
            obj.validate(function (err) {
                err.should.property('name', 'ValidationError')
                err.errors.should.property('contacts.0.contactId')
                done()
            })
        })

        it('Should pass on valid ID in sub-schema', function (done) {
            var c = new Contact({})
            async.series([
                function (cb) {
                    c.save(cb)
                },
                function (cb) {
                    var obj = new List({
                        name: 'Test', contacts: [
                            { reason: 'My friend', contactId: c }
                        ]
                    })
                    obj.validate(cb)
                }
            ], done)
        })
    })

    describe('Self recursive schema', function () {
        var Tasks = new mongoose.Schema()
        Tasks.add({
            title: String,
            subtasks: [Tasks]
        })
        Tasks.plugin(validator)
        var Task = mongoose.model('Tasks', Tasks)

        it('Should validate recursive task', function (done) {
            var t1 = new Task({ title: 'Task 1' })
            var t2 = new Task({ title: 'Task 2', subtasks: [t1] })
            async.series([
                function (cb) {
                    t1.save(cb)
                },
                function (cb) {
                    t2.save(cb)
                }
            ], done)
        })
    })

    describe('Connection tests', function () {
        it('Correct connection should be used when specified as option',
            function (done) {
                var UserSchema = new Schema({
                    name: String
                })
                var User1 = mongoose.model('User', UserSchema)
                var User2 = connection2.model('User', UserSchema)

                var ItemSchema1 = new Schema({
                    owner: {
                        type: Schema.Types.ObjectId,
                        ref: 'User'
                    }
                })
                ItemSchema1.plugin(validator)
                var ItemSchema2 = new Schema({
                    owner: {
                        type: Schema.Types.ObjectId,
                        ref: 'User'
                    }
                })
                ItemSchema2.plugin(validator, {
                    connection: connection2
                })
                var Item1 = mongoose.model('Item', ItemSchema1)
                var Item2 = connection2.model('Item', ItemSchema2)

                var u1 = new User1({ _id: '50136e40c78c4b9403000001' })
                var u2 = new User2({ _id: '50136e40c78c4b9403000002' })
                var i1 = new Item1({ owner: '50136e40c78c4b9403000001' })
                var i2 = new Item2({ owner: '50136e40c78c4b9403000002' })
                var bad1 = new Item1({ owner: '50136e40c78c4b9403000002' })
                var bad2 = new Item2({ owner: '50136e40c78c4b9403000001' })

                async.series([
                    function (cb) {
                        async.parallel(mongoose.connections.map(function (c) {
                            return c.db.dropDatabase.bind(c.db)
                        }), cb)
                    },
                    function (cb) {
                        async.series([u1, u2, i1, i2].map(function (o) {
                            return o.save.bind(o)
                        }), cb)
                    },
                    function (cb) {
                        bad1.validate(function (err) {
                            should(!!err).eql(true)
                            err.should.property('name', 'ValidationError')
                            err.errors.should.property('owner')
                            cb()
                        })
                    },
                    function (cb) {
                        bad2.validate(function (err) {
                            should(!!err).eql(true)
                            err.should.property('name', 'ValidationError')
                            err.errors.should.property('owner')
                            cb()
                        })
                    }
                ], done)
            })
    })
})
