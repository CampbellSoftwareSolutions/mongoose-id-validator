## mongoose-id-validator

Provides a mongoose plugin that can be used to verify that a document which references 
other documents by their ID is referring to documents that actually exist.

This plugin works by performing a count query for documents in the relevant collection with the 
ID specified in the document being validated. Note that the validation method is only executed if the ID
value has been updated. This helps prevent unnecessary queries when saving a document if the ID has not been changed.

However, please be aware that this will NOT catch any IDs that were valid at the time they were saved but the referenced 
document has subsequently been removed. You should have validation logic in your delete/remove code to handle this. 

# Usage

Install via NPM

    $ npm install mongoose-id-validator

Then you can use the plugin on your schemas

```javascript
var idvalidator = require('mongoose-id-validator');

var ManufacturerSchema = new Schema({
  name : String
});
var Manufacturer = mongoose.model('Manufacturer', ManufacturerSchema);

var CarSchema = new Schema({
  name         : String,
  manufacturer : { 
  					type: Schema.Types.ObjectId, 
  					ref: 'Manufacturer',
  					required: true
  				  }
});
CarSchema.plugin(idvalidator, { message: 'Bad manufacturer' });
var Car = mongoose.model('Car', CarSchema);

var ford = new ManufacturerSchema({ name : 'Ford' });

ford.save(function() {
  var focus = new Car({ name : 'Focus' });
  focus.manufacturer = "50136e40c78c4b9403000001";

  focus.validate(function(err) {
    //err.errors would contain a validation error with message "Bad manufacturer"
    
    focus.manufacturer = ford;
    focus.validate(function(err) {
      //err will now be null as validation will pass
    });
  });
});
```
## Options

```javascript
Model.plugin(id-validator, {
  /* Custom validation message with {PATH} being replaced 
  * with the relevant schema path that contains an invalid 
  * document ID.
  */
  message : 'Bad ID value for {PATH}'  
});
```

# Tests

To run the tests install mocha

    npm install mocha -g

and then run (with a local MongoDB instance available)

    npm test
    
# Issues

Please use the GitHub issue tracker to raise any problems or feature requests.

If you would like to submit a pull request with any changes you make, please feel free!
    
# Legal

Code is Copyright (C) Campbell Software Solutions 2014.

This module is available under terms of the LGPL V3 license. Hence you can use it in other proprietary projects 
but any changes to the library should be made available.      
