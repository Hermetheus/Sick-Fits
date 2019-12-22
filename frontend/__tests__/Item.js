import ItemComponent from '../components/Item';
import { shallow } from 'enzyme';

const fakeItem = {
  id: 'ABC123',
  title: 'A Cool Item',
  price: 5000,
  description: 'This is a cool item',
  image: 'dog.jpg',
  largeImage: 'largedog.jpg'
};

describe('<Item />', () => {
  fit('renders and displays properly', () => {
    const wrapper = shallow(<ItemComponent item={fakeItem} />);
    const PriceTag = wrapper.find('PriceTag');
    console.log(PriceTag.dive().text());
    expect(PriceTag.children().text()).toBe('$50');
    // console.log(PriceTag.debug());
    // console.log(wrapper.debug());
    expect(wrapper.find('Title a').text()).toBe(fakeItem.title);
    const img = wrapper.find('img');
    console.log(img.debug());
    expect(img.props().src).toBe(fakeItem.image);
    expect(img.props().alt).toBe(fakeItem.title);
    
  });
});
