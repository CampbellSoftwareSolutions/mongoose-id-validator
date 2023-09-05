var mongoose = require('mongoose')
var validator = require('../lib/id-validator')
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

before(async function () {
    await mongoose.connect(url, { useNewUrlParser: true })
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

    beforeEach(async function () {
        await Promise.all([
            Manufacturer.deleteMany({}),
            Colour.deleteMany({}),
            Car.deleteMany({}),
            Bike.deleteMany({})
        ])
        colours = {}
        await Promise.all(
            'red green black blue silver'.split(' ').map((c) => {
            var newColour = new Colour({
                name: c
            })
            colours[c] = newColour
            return newColour.save()
        }))
    })

    it('Should allow no manufacturer/colour IDs as developer can use '
        + 'mongoose required option to make these mandatory', async function () {
            var c = new Car({
                name: 'Test Car'
            })
            await c.save()
        })

    it('Should pass validation with explicit null ID', async function () {
        var c = new Car({
            name: 'Test Car',
            manufacturer: null
        })
        await c.validate()
    })

    it('Should pass validation with explicit undefined ID', async function () {
        var c = new Car({
            name: 'Test Car',
            manufacturer: undefined
        })
        await c.validate()
    })

    it('Should pass validation with explicit null array', async function () {
        var c = new Car({
            name: 'Test Car',
            colours: null
        })
        await c.save()
    })

    it('Should pass validation with explicit undefined array', async function () {
        var c = new Car({
            name: 'Test Car',
            colours: undefined
        })
        await c.save()
    })

    it('Should pass validation with existing ID', async function () {
        var m = new Manufacturer({
            name: 'Car Maker'
        })
        var c = new Car({
            name: 'Test Car',
            manufacturer: m._id
        })
        await m.save()
        await c.save()
    })

    it('Should fail validation with custom message on bad ID', async function () {
        var c = new Car({
            name: 'Test Car',
            manufacturer: '50136e40c78c4b9403000001'
        })

        try {
            await c.validate();
        }
        catch(err) {
            err.name.should.eql('ValidationError')
            err.errors.manufacturer.message.should.eql('manufacturer ID is bad')
        }
    })

    it('Should fail validation on bad ID with IdValidator instance', async function () {
            var b = new Bike({
                name: 'Test Bike',
                manufacturer: '50136e40c78c4b9403000001'
            })
            try {
                await b.validate();
            }
            catch(err) {
                err.name.should.eql('ValidationError')
                err.errors.manufacturer.message.should.eql(
                    'manufacturer references a non existing ID')
            }
        })

    it('Should ignore validation when it is disabled', async function () {
        Bike.disableValidation()
        var b = new Bike({
            name: 'Test Bike',
            manufacturer: '50136e40c78c4b9403000001'
        })
        await b.save()
    })

    it('Should fail validation if bad ID set after previously good ID value',
        async function () {
            var savePassed = false
            var m = new Manufacturer({
                name: 'Car Maker'
            })
            var c = new Car({
                name: 'Test Car',
                manufacturer: m._id
            })

            try {
                await m.save()
                await c.save()
                savePassed = true
                c.manufacturer = '50136e40c78c4b9403000001'
                await c.save()
            }
            catch(err) {
                should(savePassed).be.ok
                err.name.should.eql('ValidationError')
                err.errors.manufacturer.message.should.eql('manufacturer ID is bad')
            }
        })

    it(
        'Should pass validation if no ID value changed (even when manufacturer subsequently removed)',
        async function () {
            var m = new Manufacturer({
                name: 'Car Maker'
            })
            var c = new Car({
                name: 'Test Car',
                manufacturer: m._id
            })
            await m.save()
            await c.save()
            await Manufacturer.deleteMany({})
            await c.save()
        })

    it('Should validate correctly IDs in an array of ID references',
        async function () {
            var c = new Car({
                name: 'Test Car',
                colours: [
                    colours['red']._id,
                    colours['blue']._id,
                    colours['black']._id
                ]
            })
            await c.save()
        })

    it('Should fail ID validation in an array of ID references',
        async function () {
            var c = new Car({
                name: 'Test Car',
                colours: [
                    colours['red']._id,
                    '50136e40c78c4b9403000001',
                    colours['black']._id
                ]
            })
            try {
                await c.save()
            }
            catch (err) {
                err.name.should.eql('ValidationError')
                err.errors.colours.message.should.eql('colours ID is bad')
            }
        })

    it(
        'Array of ID values should pass validation if not modified since last save',
        async function () {
            var c = new Car({
                type: Schema.Types.ObjectId,
                colours: [
                    colours['red']._id,
                    colours['blue']._id,
                    colours['black']._id
                ]
            })
            await c.save()
            await colours['blue'].deleteOne()
            await c.validate()
        })

    it('Should not trigger ref validation if path not modified',
        async function () {
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

            await m.save()
            await c.save()
            var carRes = Car.findById(c._id)
            carRes.name = 'd'
            await carRes.validate() //must not trigger a count as manufacturerId not modified
            should(called).be.equal(1)

            Manufacturer.countDocuments = tmp
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

        before(async function () {
            await Person.deleteMany({})
            await Info.deleteMany({})
            await jack.save()
            await jill.save()
            await ann.save()
        })

        it('Should validate with single ID value that matches condition',
            async function () {
                var i = new Info({ bestMaleFriend: jack._id })
                await i.validate()
            })

        it(
            'Should fail to validate single ID value that exists but does not match conditions',
            async function () {
                var i = new Info({ bestMaleFriend: jill._id })
                try {
                    await i.validate();
                }
                catch (err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('bestMaleFriend')
                }
            })

        it('Should validate array of ID values that match conditions',
            async function () {
                var i = new Info({ femaleFriends: [ann._id, jill._id] })
                await i.validate()
            })

        it(
            'Should not validate array of ID values containing value that exists but does not match conditions',
            async function () {
                var i = new Info({ femaleFriends: [jill._id, jack._id] })
                try {
                    await i.validate()
                }
                catch (err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('femaleFriends')
                }
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

        before(async function () {
            await People.deleteMany({})
            await Friends.deleteMany({})
            await jack.save()
            await jill.save()
            await ann.save()
        })

        it('Should validate with single ID value that matches condition',
            async function () {
                var i = new Friends({ mustBeFemale: false, bestFriend: jack._id })
                await i.validate()
            })

        it(
            'Should fail to validate single ID value that exists but does not match conditions',
            async function () {
                var i = new Friends({ mustBeFemale: true, bestFriend: jack._id })
                try {
                    await i.validate()
                }
                catch(err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('bestFriend')
                }
            })

        it('Should validate array of ID values that match conditions',
            async function () {
                var i = new Friends({ mustBeFemale: true, friends: [ann._id, jill._id] })
                await i.validate()
            })

        it(
            'Should not validate array of ID values containing value that exists but does not match conditions',
            async function () {
                var i = new Friends({
                    mustBeFemale: true,
                    friends: [jill._id, jack._id]
                })

                try {
                    await i.validate()
                }
                catch(err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('friends')
                }
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

        before(async function () {
            await item1.save()
        })

        it('Should fail to validate duplicate entries with default option',
            async function () {
                var i = new InventoryNoDuplicates({ items: [item1._id, item1._id] })
                try {
                    i.validate()
                }
                catch(err) {
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('items')
                }
            })

        it('Should pass validation of duplicate entries when allowDuplicates set',
            async function () {
                var i = new InventoryDuplicates({ items: [item1._id, item1._id] })
                await i.validate()
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

        it('Should allow empty array', async function () {
            var obj = new List({ name: 'Test', contacts: [] })
            await obj.validate()
        })

        it('Should fail on invalid ID inside sub-schema', async function () {
            var obj = new List({
                name: 'Test', contacts: [
                    { reason: 'My friend', contactId: '50136e40c78c4b9403000001' }
                ]
            })
            try {
                await obj.validate()
            }
            catch (err) {
                err.should.property('name', 'ValidationError')
                err.errors.should.property('contacts.0.contactId')
            }
        })

        it('Should pass on valid ID in sub-schema', async function () {
            var c = new Contact({})
            await c.save()
            var obj = new List({
                name: 'Test', contacts: [
                    { reason: 'My friend', contactId: c._id }
                ]
            })
            await obj.validate()
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

        it('Should validate recursive task', async function () {
            var t1 = new Task({ title: 'Task 1' })
            var t2 = new Task({ title: 'Task 2', subtasks: [t1._id] })
            await t1.save()
            await t2.save()
        })
    })

    describe('Connection tests', function () {
        it('Correct connection should be used when specified as option',
            async function () {
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

                await Promise.all(mongoose.connections.map((c) => {
                    return c.db.dropDatabase()
                }))
                await u1.save()
                await u2.save()
                await i1.save()
                await i2.save()
                try {
                    await bad1.validate()
                }
                catch(err) {
                    should(!!err).eql(true)
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('owner')
                }
                try {
                    await bad2.validate()
                }
                catch (err) {
                    should(!!err).eql(true)
                    err.should.property('name', 'ValidationError')
                    err.errors.should.property('owner')
                }
            })
    })
})
