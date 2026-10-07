// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract BlockCare {
    enum Role { None, Patient, Doctor, Lab }

    struct Record {
        string ipfsHash;
        string recordType;
        address uploadedBy;
        uint256 timestamp;
    }

    address public admin;
    mapping(address => Role) public roles;
    mapping(address => Record[]) private records;

    // access[patient][provider]: doctor = can read, lab = can upload
    mapping(address => mapping(address => bool)) public access;
    mapping(address => mapping(address => bool)) public requested;

    event RoleSet(address indexed user, Role role);
    event RecordAdded(address indexed patient, address indexed by, string ipfsHash, string recordType, uint256 timestamp);
    event AccessRequested(address indexed patient, address indexed provider);
    event AccessGranted(address indexed patient, address indexed provider);
    event AccessRevoked(address indexed patient, address indexed provider);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    // ---------- roles ----------
    function registerAsPatient() public {
        require(roles[msg.sender] == Role.None, "Already has a role");
        roles[msg.sender] = Role.Patient;
        emit RoleSet(msg.sender, Role.Patient);
    }

    function approveProvider(address _user, Role _role) public onlyAdmin {
        require(_role == Role.Doctor || _role == Role.Lab, "Role must be Doctor or Lab");
        require(roles[_user] != Role.Patient, "User is a patient");
        roles[_user] = _role;
        emit RoleSet(_user, _role);
    }

    function removeProvider(address _user) public onlyAdmin {
        require(roles[_user] == Role.Doctor || roles[_user] == Role.Lab, "Not a provider");
        roles[_user] = Role.None;
        emit RoleSet(_user, Role.None);
    }

    // ---------- records ----------
    function addRecord(string memory _ipfsHash, string memory _recordType) public {
        require(roles[msg.sender] == Role.Patient, "Not a patient");
        records[msg.sender].push(Record(_ipfsHash, _recordType, msg.sender, block.timestamp));
        emit RecordAdded(msg.sender, msg.sender, _ipfsHash, _recordType, block.timestamp);
    }

    function addRecordFor(address _patient, string memory _ipfsHash, string memory _recordType) public {
        require(roles[msg.sender] == Role.Lab, "Not a lab");
        require(roles[_patient] == Role.Patient, "Not a patient");
        require(access[_patient][msg.sender], "Patient has not allowed this lab");
        records[_patient].push(Record(_ipfsHash, _recordType, msg.sender, block.timestamp));
        emit RecordAdded(_patient, msg.sender, _ipfsHash, _recordType, block.timestamp);
    }

    // ---------- access ----------
    function requestAccess(address _patient) public {
        require(roles[msg.sender] == Role.Doctor || roles[msg.sender] == Role.Lab, "Not a provider");
        require(roles[_patient] == Role.Patient, "Not a patient");
        requested[_patient][msg.sender] = true;
        emit AccessRequested(_patient, msg.sender);
    }

    function grantAccess(address _provider) public {
        require(roles[msg.sender] == Role.Patient, "Not a patient");
        require(roles[_provider] == Role.Doctor || roles[_provider] == Role.Lab, "Not a provider");
        access[msg.sender][_provider] = true;
        requested[msg.sender][_provider] = false;
        emit AccessGranted(msg.sender, _provider);
    }

    function revokeAccess(address _provider) public {
        require(roles[msg.sender] == Role.Patient, "Not a patient");
        access[msg.sender][_provider] = false;
        emit AccessRevoked(msg.sender, _provider);
    }

    // ---------- reading ----------
    function canRead(address _patient, address _who) internal view returns (bool) {
        if (_who == _patient) return true;
        return roles[_who] == Role.Doctor && access[_patient][_who];
    }

    function getRecordCount(address _patient) public view returns (uint256) {
        require(canRead(_patient, msg.sender), "No access");
        return records[_patient].length;
    }

    function getRecord(address _patient, uint256 _index)
        public view
        returns (string memory, string memory, address, uint256)
    {
        require(canRead(_patient, msg.sender), "No access");
        require(_index < records[_patient].length, "Bad index");
        Record memory r = records[_patient][_index];
        return (r.ipfsHash, r.recordType, r.uploadedBy, r.timestamp);
    }
}