// Run with Node 7.x as:
// node --harmony-async-await  deploy.js

let fs = require("fs");
let Web3 = require('web3'); // https://www.npmjs.com/package/web3
let solc = require('solc');
let solc_abi = require('solc/abi');

function getContractCode(senderName, receiverAddress) {
    return `pragma solidity ^0.4.16;

contract TransferContract {
    address receiver;
    address creator;
    public string user;
    
    mapping(address => uint256) transfered;

    event TransferComplete(address payer, uint value);

    function TransferContract() {
        recipient = ${receiverAddress};
        user = '${senderName}';
        creator = msg.sender;
    }
    
    function () payable {
        receiver.transfer(msg.value);
        TransferComplete(msg.sender, msg.value);
        transfered[msg.sender] += msg.value;
    }
}`;
}

function compileContract(contractName, contractCode) {
    let filename = contractName + '.sol', input = {};
    input[filename] = contractCode;
    let output = solc.compile({ sources: input }, 1);

    let result = {};
    for (let name of output.contracts) {
        console.log(name + ': ' + output.contracts[name].bytecode);
        let bin = output.contracts[name].bytecode;
        let abi = solc_abi('0.4.16', output.contracts[name].interface);
        result[name] = {bin: bin, abi: abi};
    }
    result.errors = output.errors;
    return result;
}

async function deployContract(web3, abi, code, password) {
    // Create Contract proxy class
    let gas = 100000;
    let TransactionalContract = web3.eth.contract(abi);

    // Unlock the coinbase account to make transactions out of it
    console.log("Unlocking coinbase account");
    try {
        web3.personal.unlockAccount(web3.eth.coinbase, password);
    } catch (e) {
        console.log(e);
        return {error: e};
    }

    console.log("Deploying the contract");
    let contract = TransactionalContract.new({from: web3.eth.coinbase, gas: gas, data: code});

    // Transaction has entered to geth memory pool
    console.log("Your contract is being deployed in transaction at transaction hash: " + contract.transactionHash);

    // http://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // We need to wait until any miner has included the transaction
    // in a block to get the address of the contract
    async function waitBlock() {
        while (true) {
            let receipt = web3.eth.getTransactionReceipt(contract.transactionHash);
            if (receipt && receipt.contractAddress) {
                console.log("Your contract has been deployed at address: " + receipt.contractAddress);
                console.log("Note that it might take 30 - 90 sceonds for the block to propagate befor it's visible");
                return new Promise(resolve => receipt.contractAddress);
            }
            console.log("Waiting a mined block to include your contract... currently in block " + web3.eth.blockNumber);
            await sleep(4000);
        }
    }

    return await waitBlock();
}

export async function createContract(web3Config = null, password, senderName, receiverAddress) {

    let contractName = 'transactionalContract';

    // For geth VPS server + SSH tunneling see
    // https://gist.github.com/miohtama/ce612b35415e74268ff243af645048f4
    let web3;
    if (web3Config instanceof Web3) {
        // Use provided web3 connection
        web3 = web3Config;
    } else if (Object.keys(web3Config).length > 0) {
        // Create a web3 connection to a running geth node over JSON-RPC running at
        // web3Config.http
        web3 = new Web3();
        web3.setProvider(new web3.providers.HttpProvider(web3Config.http));
    } else {
        // Create a web3 connection to a running geth node over JSON-RPC running at
        // http://localhost:8545
        web3 = new Web3();
        web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));
    }

    let contractSources = getContractCode(senderName, receiverAddress);
    // Read the compiled contract code
    let contracts = compileContract(contractName, contractSources);

    if (contracts.errors) {
        console.error(contracts.errors);
        return {errors: contracts.errors};
    }

    // ABI description as JSON structure
    let abi = JSON.parse(contracts[contractName].abi);
    // Smart contract EVM bytecode as hex
    let code = contracts[contractName].bin;

    let address = await deployContract(web3, abi, code, password);
    return !address.error
        ? {contractName: {abi: abi, address: address}}
        : {contractName: {error: address.error}};
}