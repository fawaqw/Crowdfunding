pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RewardToken is ERC20, Ownable{

    address public crowdfundingContract;

    constructor() ERC20("Reward", "RWRD") Ownable(msg.sender) {}

        function setCrowdfundingContract(address _addr) external onlyOwner{
            require(crowdfundingContract == address(0), "Already set");
            crowdfundingContract = _addr;}

        function mint(address to, uint amount) external {
            require(msg.sender == crowdfundingContract, "Not allowed");
            _mint(to, amount);
        }
        
}
