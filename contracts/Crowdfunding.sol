// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RewardToken.sol";

contract Crowdfunding {

    RewardToken public rewardToken;


    //campaign structure
    struct Campaign {
        string title;
        uint goal;
        uint deadline;
        uint amountRaised;
        address creator;
        bool finalized;
    }

    Campaign[] public campaigns;
    
    // mapping from campaign ID 
    mapping(uint => mapping(address => uint)) public contributions;

    //events for frontend and tracking
    event CampaignCreated(uint id, string title, uint goal, uint deadline, address creator);
    event Contributed(uint id, address contributor, uint amount);
    event CampaignFinalized(uint id, uint amountRaised);
    
    // link to the deployed RewardToken contract
    constructor(address _addr) {
        rewardToken = RewardToken(_addr);
    }

    // create a new crowdfunding campaign
    function createCampaign(string memory _title, uint _goal, uint _duration) public{
        Campaign memory newCampaign = Campaign({
            title: _title,
            goal: _goal,
            deadline: block.timestamp + _duration,
            amountRaised: 0,
            creator: msg.sender,
            finalized: false
        });
        campaigns.push(newCampaign);
        // emit event for frontend tracking
        emit CampaignCreated(campaigns.length - 1, _title, _goal, block.timestamp + _duration, msg.sender);
    }

    // contribute ETH to an active campaign
    function contribute(uint _id) public payable {
        Campaign storage campaign = campaigns[_id];
        require(!campaign.finalized, "Campaign is finalized");

        require(campaign.deadline > block.timestamp, "Campaign has ended");
        require(msg.value > 0, "You must contribute at least 1 wei");

        campaign.amountRaised += msg.value;

        contributions[_id][msg.sender] += msg.value;

        rewardToken.mint(msg.sender, msg.value * 100);

        emit Contributed(_id, msg.sender, msg.value);

    }

    // finalize a campaign (after deadline or by creator)
    function finalizeCampaign(uint _id) public {
    Campaign storage campaign = campaigns[_id];

    require(!campaign.finalized, "Campaign already finalized");

    require(
        block.timestamp >= campaign.deadline || msg.sender == campaign.creator,
        "Only creator can finalize before deadline"
    );

    campaign.finalized = true;

    emit CampaignFinalized(_id, campaign.amountRaised);
    }  


    // view function: get all details of a campaign
    function getCampaign(uint _id) public view returns (
        string memory,
        uint,
        uint,
        uint,
        address,
        bool
        ) {
            Campaign storage c = campaigns[_id];
            return (
                c.title,
                c.goal,
                c.deadline,
                c.amountRaised,
                c.creator,
                c.finalized
                );
    }


    // view function: get reward token balance of a user
    function getRewardBalance(address user) public view returns (uint) {
    return rewardToken.balanceOf(user);
}
}


