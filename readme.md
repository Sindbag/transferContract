# Transfer Account

## Purpose

In order not to send unique identifier in each transaction and reduce human factor,
the code creates user-attached smart-contract account.

##### Installation

Clone github repo and run:

`npm install .`

##### Usage

Main function `createContract` can be imported.

`import createContract from 'transfer_contract`

__createContract__(web3Config = null, password, senderName, receiverAddress)

