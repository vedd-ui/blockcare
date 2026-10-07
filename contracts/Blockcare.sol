// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract BlockCare {
    struct Record {
        string ipfsHash;     // the file's ID on IPFS
        string recordType;   // e.g. "lab report"
        address uploadedBy;
        uint256 timestamp;
    }

    mapping(address => Record[]) private records;
    mapping(address => mapping(address => bool)) public hasAccess;
    mapping(address => mapping(address => bool)) public hasRequested;

    event RecordAdded(address indexed patient, string ipfsHash, string recordType, uint256 timestamp);
    event AccessRequested(address indexed patient, address indexed provider);
    event AccessGranted(address indexed patient, address indexed provider);
    event AccessRevoked(address indexed patient, address indexed provider);

    // Patient adds a record
    function addRecord(string memory _ipfsHash, string memory _recordType) public {
        records[msg.sender].push(Record(_ipfsHash, _recordType, msg.sender, block.timestamp));
        emit RecordAdded(msg.sender, _ipfsHash, _recordType, block.timestamp);
    }

    // Doctor asks a patient for access
    function requestAccess(address _patient) public {
        hasRequested[_patient][msg.sender] = true;
        emit AccessRequested(_patient, msg.sender);
    }

    // Patient says yes
    function grantAccess(address _provider) public {
        hasAccess[msg.sender][_provider] = true;
        hasRequested[msg.sender][_provider] = false;
        emit AccessGranted(msg.sender, _provider);
    }

    // Patient takes access back
    function revokeAccess(address _provider) public {
        hasAccess[msg.sender][_provider] = false;
        emit AccessRevoked(msg.sender, _provider);
    }

    function getRecordCount(address _patient) public view returns (uint256) {
        require(msg.sender == _patient || hasAccess[_patient][msg.sender], "No access");
        return records[_patient].length;
    }

    function getRecord(address _patient, uint256 _index)
        public view
        returns (string memory, string memory, address, uint256)
    {
        require(msg.sender == _patient || hasAccess[_patient][msg.sender], "No access");
        require(_index < records[_patient].length, "Bad index");
        Record memory r = records[_patient][_index];
        return (r.ipfsHash, r.recordType, r.uploadedBy, r.timestamp);
    }
}